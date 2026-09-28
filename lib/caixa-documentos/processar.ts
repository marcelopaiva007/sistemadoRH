// Caixa de documentos — o motor. Cada chamada faz UMA unidade de trabalho de
// UM arquivo: ler o próximo bloco de páginas com a IA, ou encaminhar até
// ITENS_POR_RODADA documentos já lidos. Quem repete é o navegador (a tela chama
// a rota até o arquivo concluir) — assim nenhuma chamada passa do teto de
// 300 s da Vercel, e fechar a aba no meio não perde nada: reabrir continua.
//
// Só servidor. Quem chama (a rota) já conferiu que o usuário opera o CNPJ do
// arquivo e alcança TODO o escopo congelado nele.
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { baixarDoBlob, removerDoBlob } from "@/lib/blob";
import { hojeUTC } from "@/lib/datas";
import { juntarFronteiras, normalizarBloco, normalizarCampos, type CamposLidos, type InventarioPaginas, type ItemLido } from "./extracao";
import { identificar, type Candidato, type EmpresaPorCnpj } from "./identificar";
import { decidir, paginasSoDele } from "./decidir";
import { dataDeReferencia, gravarItem, impedimentosNoBanco } from "./gravar";
import { imagemParaLeitura, recortarPdf } from "./pdf";
import type { EntradaLeitura, Extrator } from "./ia";
import { DESTINO, ITENS_POR_RODADA, tipoCaixaLabel, visivelNoPortal, type TipoCaixa } from "./tipos";

/** Estados em que ainda há trabalho. */
export const STATUS_ATIVOS = ["PENDENTE", "LENDO", "ROTEANDO"] as const;
/** Falhas seguidas no MESMO passo antes de desistir (zera a cada passo concluído). */
const MAX_TENTATIVAS = 3;
/** Trava vencida: maior que o maxDuration da rota (300 s), com folga. */
const TRAVA_MS = 330_000;

export type Progresso = {
  id: string;
  status: string;
  paginas: number | null;
  paginasLidas: number;
  itens: { total: number; gravados: number; conferir: number; pendentes: number };
  erro: string | null;
  /** Outra aba/rodada está com o arquivo agora: esperar e chamar de novo. */
  ocupado: boolean;
  /** A conta da IA recusou: parar de chamar até alguém resolver. */
  iaIndisponivel?: boolean;
};

export async function progressoDe(id: string, ocupado = false): Promise<Progresso | null> {
  const r = await prisma.documentoRecebido.findUnique({
    where: { id },
    select: { id: true, status: true, paginas: true, proximaPagina: true, erro: true },
  });
  if (!r) return null;
  const grupos = await prisma.itemDocumentoRecebido.groupBy({
    by: ["status"],
    where: { recebidoId: id },
    _count: { _all: true },
  });
  const n = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  return {
    id: r.id,
    status: r.status,
    paginas: r.paginas,
    paginasLidas: Math.min(r.paginas ?? 0, r.proximaPagina - 1),
    itens: {
      total: grupos.reduce((a, g) => a + g._count._all, 0),
      gravados: n("GRAVADO"),
      conferir: n("CONFERIR"),
      pendentes: n("PENDENTE") + n("GRAVANDO"),
    },
    erro: r.erro,
    ocupado,
  };
}

export async function bytesDoArquivo(arquivo: { blobUrl: string | null; conteudo: Uint8Array | null }): Promise<Uint8Array<ArrayBuffer> | null> {
  if (arquivo.blobUrl) {
    const lido = await baixarDoBlob(arquivo.blobUrl);
    return lido.ok ? new Uint8Array(lido.bytes) : null;
  }
  return arquivo.conteudo ? new Uint8Array(arquivo.conteudo) : null;
}

/** Dias que o original fica guardado depois de tudo resolvido — é o prazo do "Desfazer". */
export const DIAS_GUARDA_ORIGINAL = 30;

/** Apaga o arquivo ORIGINAL (a folha inteira): ficam só as fatias, cada uma no seu destino. */
export async function apagarOriginal(recebidoId: string): Promise<void> {
  const r = await prisma.documentoRecebido.findUnique({
    where: { id: recebidoId },
    select: { arquivoId: true, arquivo: { select: { blobUrl: true } } },
  });
  if (!r?.arquivoId) return;
  await prisma.$transaction([
    prisma.documentoRecebido.update({ where: { id: recebidoId }, data: { arquivoId: null } }),
    prisma.arquivo.delete({ where: { id: r.arquivoId } }),
  ]);
  if (r.arquivo?.blobUrl) await removerDoBlob(r.arquivo.blobUrl);
}

/**
 * Faxina ao abrir a tela (sem cron): original de arquivo resolvido há mais de
 * DIAS_GUARDA_ORIGINAL dias é apagado (LGPD: a folha inteira não fica guardada
 * à toa), junto com os campos lidos dos itens; envio que nunca terminou de
 * subir vira "interrompido".
 */
export async function limparCaixa(empresaIds: string[]): Promise<void> {
  const limite = new Date(Date.now() - DIAS_GUARDA_ORIGINAL * 24 * 3600_000);
  const vencidos = await prisma.documentoRecebido.findMany({
    where: {
      empresaId: { in: empresaIds },
      arquivoId: { not: null },
      status: { in: ["CONCLUIDO", "DESCARTADO"] },
      updatedAt: { lt: limite },
      itens: { none: { status: { in: ["PENDENTE", "GRAVANDO", "CONFERIR"] } } },
    },
    select: { id: true },
    take: 20,
  });
  for (const r of vencidos) {
    await apagarOriginal(r.id);
    await prisma.itemDocumentoRecebido.updateMany({ where: { recebidoId: r.id }, data: { dados: {}, cpfLido: null, pisLido: null } });
  }
  // Envio que parou no meio (aba fechada durante o upload): nunca teve
  // conteúdo, então só se apaga o registro vazio.
  await prisma.documentoRecebido.deleteMany({
    where: { empresaId: { in: empresaIds }, status: "AGUARDANDO_UPLOAD", createdAt: { lt: new Date(Date.now() - 3600_000) } },
  });
}

type DadosItem = {
  campos: CamposLidos;
  continuaAntes?: boolean;
  continuaDepois?: boolean;
  avisos?: string[];
  opcoes?: string[];
};

export function lerDados(dados: unknown): DadosItem {
  const d = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
  return {
    campos: normalizarCampos(d.campos),
    continuaAntes: d.continuaAntes === true,
    continuaDepois: d.continuaDepois === true,
    avisos: Array.isArray(d.avisos) ? d.avisos.filter((a): a is string => typeof a === "string") : [],
    opcoes: Array.isArray(d.opcoes) ? d.opcoes.filter((a): a is string => typeof a === "string") : [],
  };
}

function dadosDe(item: ItemLido): DadosItem {
  return { campos: item.campos, continuaAntes: item.continuaAntes, continuaDepois: item.continuaDepois, avisos: item.avisos };
}

/** Nome da fatia: "<tipo>-<pessoa>-p3-4.pdf", sem acento nem espaço. */
function nomeDaFatia(tipo: TipoCaixa, nome: string, ini: number, fim: number, extensao: string): string {
  const base = `${tipoCaixaLabel(tipo).split(" ")[0]}-${nome}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `${base}-p${ini}${fim !== ini ? `-${fim}` : ""}.${extensao}`;
}

export async function avancarRecebido(
  recebidoId: string,
  usuario: { id: string | null; nome: string | null },
  extrator: Extrator,
): Promise<Progresso | null> {
  const agora = new Date();
  const corte = new Date(agora.getTime() - TRAVA_MS);

  // Trava atômica, contando a tentativa JÁ AQUI: uma rodada morta pelo teto
  // de tempo da Vercel não chega ao fim para contar — e sem isto o mesmo
  // bloco seria pago de novo para sempre.
  const pego = await prisma.documentoRecebido.updateMany({
    where: {
      id: recebidoId,
      status: { in: [...STATUS_ATIVOS] },
      tentativas: { lt: MAX_TENTATIVAS },
      OR: [{ processandoDesde: null }, { processandoDesde: { lt: corte } }],
    },
    data: { processandoDesde: agora, tentativas: { increment: 1 } },
  });
  if (pego.count === 0) {
    const r = await prisma.documentoRecebido.findUnique({
      where: { id: recebidoId },
      select: { status: true, tentativas: true, processandoDesde: true, erro: true },
    });
    if (!r) return null;
    const ativo = (STATUS_ATIVOS as readonly string[]).includes(r.status);
    const travado = !!r.processandoDesde && r.processandoDesde >= corte;
    if (ativo && !travado && r.tentativas >= MAX_TENTATIVAS) {
      await prisma.documentoRecebido.update({
        where: { id: recebidoId },
        data: { status: "ERRO", erro: r.erro ?? "A leitura falhou várias vezes seguidas.", processandoDesde: null },
      });
    }
    return progressoDe(recebidoId, ativo && travado);
  }

  const recebido = await prisma.documentoRecebido.findUniqueOrThrow({
    where: { id: recebidoId },
    include: { arquivo: { select: { blobUrl: true, conteudo: true } } },
  });
  // Toda escrita daqui em diante só vale se a trava ainda é desta rodada.
  const minha = { id: recebidoId, processandoDesde: agora };

  const soltar = (data: Record<string, unknown>) =>
    prisma.documentoRecebido.updateMany({ where: minha, data: { processandoDesde: null, ...data } });

  try {
    if (!recebido.arquivo) {
      await soltar({ status: "ERRO", erro: "O arquivo original não está mais guardado." });
      return progressoDe(recebidoId);
    }

    if (recebido.status === "PENDENTE" || recebido.status === "LENDO") {
      // Enquanto lê, já encaminha o que está completo: uma folha de 200
      // páginas mostra os primeiros contracheques gravados em minutos, não no
      // fim. Fica para depois só o que pode continuar no próximo bloco.
      const prontos = await itensProntos(recebido.id);
      if (prontos.length > 0) {
        await encaminharItens(recebido, recebido.arquivo, usuario, soltar, prontos);
      } else {
        const pausa = await lerProximoBloco(recebido, recebido.arquivo, extrator, soltar, minha);
        if (pausa) {
          const p = await progressoDe(recebidoId);
          return p ? { ...p, iaIndisponivel: true } : null;
        }
      }
    } else {
      await encaminharItens(recebido, recebido.arquivo, usuario, soltar, null);
    }
  } catch (e) {
    console.error("[caixa-documentos] rodada", e);
    await soltar({ erro: "Falha inesperada nesta rodada — tento de novo." });
  }
  return progressoDe(recebidoId);
}

type Recebido = NonNullable<Awaited<ReturnType<typeof prisma.documentoRecebido.findUnique>>>;
type Soltar = (data: Record<string, unknown>) => Promise<unknown>;

async function lerProximoBloco(
  recebido: Recebido,
  arquivo: { blobUrl: string | null; conteudo: Uint8Array | null },
  extrator: Extrator,
  soltar: Soltar,
  minha: { id: string; processandoDesde: Date },
): Promise<boolean> {
  const bytes = await bytesDoArquivo(arquivo);
  if (!bytes) {
    await soltar({ erro: "Não consegui abrir o arquivo guardado — tento de novo." });
    return false;
  }
  const ehPdf = recebido.mimeType === "application/pdf";
  const total = ehPdf ? (recebido.paginas ?? 1) : 1;
  const inicio = ehPdf ? recebido.proximaPagina : 1;
  const fim = ehPdf ? Math.min(total, inicio + recebido.tamanhoBloco - 1) : 1;
  const ultimoBloco = fim >= total;

  const partes: EntradaLeitura["partes"] = [];
  if (ehPdf) {
    for (let p = inicio; p <= fim; p++) {
      partes.push({ numero: p, bytes: total === 1 ? bytes : await recortarPdf(bytes, p, p), mimeType: "application/pdf" });
    }
  } else {
    partes.push({ numero: 1, bytes: await imagemParaLeitura(bytes), mimeType: "image/jpeg" });
  }

  const leitura = await extrator({ partes, bloco: { inicio, fim, totalPaginas: ehPdf ? total : null }, original: bytes });

  if (!leitura.ok) {
    const tokens = { tokensEntrada: { increment: leitura.tokensEntrada }, tokensSaida: { increment: leitura.tokensSaida } };
    if (leitura.pausar) {
      // Devolve a tentativa contada na trava: o arquivo não tem culpa.
      await soltar({ erro: leitura.erro, tentativas: { decrement: 1 } });
      return true;
    }
    if (leitura.reduzirBloco && recebido.tamanhoBloco > 1) {
      // Bloco pela metade na PRÓXIMA rodada; o passo mudou, as tentativas zeram.
      await soltar({ erro: leitura.erro, tamanhoBloco: Math.ceil(recebido.tamanhoBloco / 2), tentativas: 0, ...tokens });
      return false;
    }
    if (leitura.definitivo || leitura.reduzirBloco) {
      // Recusa, arquivo que a IA não abre, ou uma página sozinha que não
      // coube: não adianta repetir. Estas páginas vão para a conferência como
      // "não lidas" e o resto do arquivo segue.
      await gravarBloco(recebido, minha, inicio, fim, ultimoBloco, fim + 1, {
        resumo: null,
        inventario: {},
        itens: [],
        naoLidas: { motivo: `A IA não leu esta página: ${leitura.erro}` },
        modelo: null,
        tokensEntrada: leitura.tokensEntrada,
        tokensSaida: leitura.tokensSaida,
      });
      return false;
    }
    await soltar({ erro: leitura.erro, ...tokens });
    return false;
  }

  const lido = normalizarBloco(leitura.bruto, { inicio, fim });
  let itens = lido.itens;
  let inventario = lido.inventario;
  let proxima = fim + 1;

  // Documento cortado no fim do bloco que COMEÇOU dentro dele: descarta a
  // metade e recomeça o próximo bloco na página em que ele começa — assim ele
  // é lido inteiro de uma vez, em vez de costurado depois.
  if (!ultimoBloco) {
    const cortado = itens
      .filter((i) => i.continuaDepois && i.paginaFim === fim && i.paginaInicio > inicio)
      .sort((x, y) => x.paginaInicio - y.paginaInicio)[0];
    if (cortado) {
      proxima = cortado.paginaInicio;
      itens = itens.filter((i) => i.paginaInicio < proxima);
      inventario = Object.fromEntries(Object.entries(inventario).filter(([pg]) => Number(pg) < proxima));
    }
  }

  await gravarBloco(recebido, minha, inicio, proxima - 1, proxima > total, proxima, {
    resumo: lido.resumo,
    inventario,
    itens,
    naoLidas: null,
    modelo: leitura.modelo,
    tokensEntrada: leitura.tokensEntrada,
    tokensSaida: leitura.tokensSaida,
  });
  return false;
}

/** Grava o resultado de um bloco e avança — tudo numa transação cercada pela trava. */
async function gravarBloco(
  recebido: Recebido,
  minha: { id: string; processandoDesde: Date },
  inicio: number,
  fim: number,
  ultimo: boolean,
  proxima: number,
  r: {
    resumo: string | null;
    inventario: InventarioPaginas;
    itens: ItemLido[];
    naoLidas: { motivo: string } | null;
    modelo: string | null;
    tokensEntrada: number;
    tokensSaida: number;
  },
) {
  await prisma.$transaction(async (tx) => {
    // Cerca: só avança se ninguém avançou este mesmo bloco (outra aba com a
    // trava vencida). Sem isto, o bloco entraria duas vezes.
    const avancou = await tx.documentoRecebido.updateMany({
      where: { ...minha, proximaPagina: inicio },
      data: {
        proximaPagina: proxima,
        status: ultimo ? "ROTEANDO" : "LENDO",
        resumoIa: recebido.resumoIa ?? r.resumo,
        inventarioPaginas: { ...((recebido.inventarioPaginas as InventarioPaginas | null) ?? {}), ...r.inventario },
        ...(r.modelo ? { modeloIa: r.modelo } : {}),
        tokensEntrada: { increment: r.tokensEntrada },
        tokensSaida: { increment: r.tokensSaida },
        tentativas: 0,
        erro: null,
        processandoDesde: null,
      },
    });
    if (avancou.count !== 1) return;

    const jaLidos = await tx.itemDocumentoRecebido.count({ where: { recebidoId: recebido.id } });
    if (r.naoLidas) {
      await tx.itemDocumentoRecebido.createMany({
        data: Array.from({ length: fim - inicio + 1 }, (_, i) => ({
          recebidoId: recebido.id,
          ordem: jaLidos + i,
          tipo: "OUTRO_DO_COLABORADOR",
          paginaInicio: inicio + i,
          paginaFim: inicio + i,
          dados: { campos: normalizarCampos({}) },
          confianca: 0,
          status: "CONFERIR",
          motivo: r.naoLidas!.motivo,
        })),
      });
    } else if (r.itens.length > 0) {
      await tx.itemDocumentoRecebido.createMany({
        data: r.itens.map((it, i) => ({
          recebidoId: recebido.id,
          ordem: jaLidos + i,
          tipo: it.tipo,
          paginaInicio: it.paginaInicio,
          paginaFim: it.paginaFim,
          nomeLido: it.nome,
          cpfLido: it.cpf,
          pisLido: it.pis,
          cnpjLido: it.cnpj,
          dados: dadosDe(it),
          confianca: it.confianca,
        })),
      });
    }

    if (ultimo) {
      // Documento maior que um bloco (atravessou a fronteira mesmo começando
      // no início dele) vira um só.
      const lidos = await tx.itemDocumentoRecebido.findMany({
        where: { recebidoId: recebido.id, status: "PENDENTE" },
        orderBy: { ordem: "asc" },
      });
      const comoLido: ItemLido[] = lidos.map((l) => {
        const d = lerDados(l.dados);
        return {
          tipo: l.tipo as TipoCaixa,
          paginaInicio: l.paginaInicio,
          paginaFim: l.paginaFim,
          continuaAntes: !!d.continuaAntes,
          continuaDepois: !!d.continuaDepois,
          nome: l.nomeLido,
          cpf: l.cpfLido,
          pis: l.pisLido,
          cnpj: l.cnpjLido,
          confianca: l.confianca,
          campos: d.campos,
          avisos: d.avisos ?? [],
        };
      });
      const juntos = juntarFronteiras(comoLido);
      await tx.itemDocumentoRecebido.deleteMany({ where: { recebidoId: recebido.id, status: "PENDENTE" } });
      const base = await tx.itemDocumentoRecebido.count({ where: { recebidoId: recebido.id } });
      if (juntos.length > 0) {
        await tx.itemDocumentoRecebido.createMany({
          data: juntos.map((it, i) => ({
            recebidoId: recebido.id,
            ordem: base + i,
            tipo: it.tipo,
            paginaInicio: it.paginaInicio,
            paginaFim: it.paginaFim,
            nomeLido: it.nome,
            cpfLido: it.cpf,
            cnpjLido: it.cnpj,
            dados: dadosDe(it),
            confianca: it.confianca,
          })),
        });
      }
    }
  });
}

/**
 * Itens lidos que já podem ser encaminhados enquanto a leitura continua: os
 * que não dizem continuar antes ou depois (esses esperam o fim da leitura,
 * para serem costurados com a outra metade).
 */
async function itensProntos(recebidoId: string) {
  const pendentes = await prisma.itemDocumentoRecebido.findMany({
    where: { recebidoId, status: "PENDENTE" },
    orderBy: { ordem: "asc" },
    take: 200,
  });
  return pendentes
    .filter((i) => {
      const d = lerDados(i.dados);
      return !d.continuaAntes && !d.continuaDepois;
    })
    .slice(0, ITENS_POR_RODADA);
}

async function encaminharItens(
  recebido: Recebido,
  arquivo: { blobUrl: string | null; conteudo: Uint8Array | null },
  usuario: { id: string | null; nome: string | null },
  soltar: Soltar,
  /** Durante a leitura: só estes. null = leitura acabou, encaminha o que sobrou e conclui. */
  somente: Awaited<ReturnType<typeof itensProntos>> | null,
) {
  // GRAVANDO velho = uma rodada morreu no meio da gravação (a transação
  // desfez tudo): o item volta para a fila.
  const vencido = new Date(Date.now() - TRAVA_MS);
  await prisma.itemDocumentoRecebido.updateMany({
    where: { recebidoId: recebido.id, status: "GRAVANDO", updatedAt: { lt: vencido } },
    data: { status: "PENDENTE" },
  });
  const lote =
    somente ??
    (await prisma.itemDocumentoRecebido.findMany({
      where: { recebidoId: recebido.id, status: "PENDENTE" },
      orderBy: { ordem: "asc" },
      take: ITENS_POR_RODADA,
    }));

  if (lote.length === 0 && somente === null) {
    const emGravacao = await prisma.itemDocumentoRecebido.count({ where: { recebidoId: recebido.id, status: "GRAVANDO" } });
    if (emGravacao > 0) {
      await soltar({});
      return;
    }
    await soltar({ status: "CONCLUIDO", tentativas: 0, erro: null });
    const contagem = await progressoDe(recebido.id);
    await registrarAuditoria({
      empresaId: recebido.empresaId,
      acao: "CRIAR",
      entidade: "DocumentoRecebido",
      entidadeId: recebido.id,
      resumo: `Caixa de documentos: "${recebido.nome}" lido — ${contagem?.itens.total ?? 0} documento(s), ${contagem?.itens.gravados ?? 0} gravado(s) automaticamente, ${contagem?.itens.conferir ?? 0} para conferir.`,
      detalhes: {
        paginas: recebido.paginas,
        tokensEntrada: recebido.tokensEntrada,
        tokensSaida: recebido.tokensSaida,
        modelo: recebido.modeloIa,
        enviadoPor: recebido.criadoPorNome,
      },
    });
    return;
  }

  const escopo = recebido.empresasEscopo;
  const [fichas, empresasComCnpj, todosItens] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, empresa: { ativo: true } },
      select: { id: true, empresaId: true, nome: true, cpf: true, pis: true, ativo: true, dataAdmissao: true, dataDesligamento: true, posicaoId: true },
    }),
    prisma.empresa.findMany({ where: { cnpj: { not: null } }, select: { id: true, cnpj: true, ativo: true } }),
    prisma.itemDocumentoRecebido.findMany({
      where: { recebidoId: recebido.id, status: { not: "DESCARTADO" }, tipo: { not: "NAO_E_DE_COLABORADOR" } },
      select: { id: true, paginaInicio: true, paginaFim: true },
    }),
  ]);
  const empresas: EmpresaPorCnpj = new Map(
    empresasComCnpj.map((e) => [e.cnpj!.replace(/\D/g, ""), { id: e.id, noEscopo: e.ativo && escopo.includes(e.id) }]),
  );
  const candidatos: Candidato[] = fichas;
  const inventario = (recebido.inventarioPaginas as InventarioPaginas | null) ?? null;
  const hoje = hojeUTC();
  // Endereço de teste da Vercel usa o banco e o armazenamento de PRODUÇÃO:
  // lá nada é gravado sozinho — tudo para na conferência.
  const ambienteDeTeste = process.env.VERCEL_ENV === "preview";

  let original: Uint8Array<ArrayBuffer> | null = null;

  for (const item of lote) {
    const tipo = item.tipo as TipoCaixa;
    const dados = lerDados(item.dados);
    const ident = identificar(
      {
        tipo,
        nome: item.nomeLido,
        cpf: item.cpfLido,
        pis: item.pisLido,
        cnpj: item.cnpjLido,
        asoTipo: dados.campos.asoTipo,
        dataReferencia: dataDeReferencia(dados.campos),
      },
      candidatos,
      empresas,
      hoje,
    );
    const colaboradorId = ident.tipo === "NENHUM" ? null : ident.colaboradorId;
    const ficha = colaboradorId ? (fichas.find((f) => f.id === colaboradorId) ?? null) : null;
    const impedimentos = ficha && DESTINO[tipo] ? await impedimentosNoBanco(tipo, dados.campos, ficha) : [];
    const outros = todosItens.filter((o) => o.id !== item.id);
    const exclusivas = paginasSoDele(
      { paginaInicio: item.paginaInicio, paginaFim: item.paginaFim, cpf: item.cpfLido, pis: item.pisLido },
      outros,
      inventario,
      visivelNoPortal(tipo),
    );
    const decisao = decidir(
      { tipo, confianca: item.confianca, campos: dados.campos, avisos: dados.avisos ?? [] },
      ident,
      { impedimentos, paginasCompartilhadas: !exclusivas },
    );

    const paraConferir = async (motivos: string[]) => {
      await prisma.itemDocumentoRecebido.updateMany({
        where: { id: item.id, status: { in: ["PENDENTE", "GRAVANDO"] } },
        data: {
          status: "CONFERIR",
          motivo: motivos.join("\n"),
          colaboradorId,
          dados: { ...dados, opcoes: ident.tipo === "NENHUM" ? ident.opcoes : [] },
        },
      });
    };

    if (decisao.acao === "CONFERIR" || ambienteDeTeste || !ficha) {
      await paraConferir(
        decisao.acao === "CONFERIR"
          ? decisao.motivos
          : ["Ambiente de teste: nada é gravado sozinho aqui — confira e grave com um clique."],
      );
      continue;
    }

    const pego = await prisma.itemDocumentoRecebido.updateMany({
      where: { id: item.id, status: "PENDENTE" },
      data: { status: "GRAVANDO" },
    });
    if (pego.count !== 1) continue;

    original ??= await bytesDoArquivo(arquivo);
    if (!original) {
      await paraConferir(["Não consegui abrir o arquivo guardado para separar as páginas desta pessoa."]);
      continue;
    }
    const fatia = await fatiaDoItem(recebido, original, item.paginaInicio, item.paginaFim, tipo, ficha.nome);

    const gravado = await gravarItem({
      tipo,
      campos: dados.campos,
      ficha,
      fatia,
      paginasExclusivas: exclusivas,
      usuario,
      origem: {
        recebidoId: recebido.id,
        itemId: item.id,
        arquivo: recebido.nome,
        paginaInicio: item.paginaInicio,
        paginaFim: item.paginaFim,
        enviadoPor: recebido.criadoPorNome,
      },
      automatico: true,
      chaveMatch: ident.tipo,
      confianca: item.confianca,
    });
    if (!gravado.ok) await paraConferir([gravado.error]);
  }

  await soltar({ tentativas: 0, erro: null });
}

/** O arquivo só com as páginas do item (PDF) ou a própria imagem. */
export async function fatiaDoItem(
  recebido: { mimeType: string },
  original: Uint8Array<ArrayBuffer>,
  paginaInicio: number,
  paginaFim: number,
  tipo: TipoCaixa,
  nomePessoa: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; nome: string; mimeType: string }> {
  const ehPdf = recebido.mimeType === "application/pdf";
  return {
    bytes: ehPdf ? await recortarPdf(original, paginaInicio, paginaFim) : original,
    nome: nomeDaFatia(tipo, nomePessoa, paginaInicio, paginaFim, ehPdf ? "pdf" : (recebido.mimeType.split("/")[1] ?? "jpg")),
    mimeType: ehPdf ? "application/pdf" : recebido.mimeType,
  };
}
