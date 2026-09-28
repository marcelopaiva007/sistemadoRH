// Caixa de documentos — gravar um item no lugar certo do sistema.
//
// Só servidor, sem "use server": chamado pela rota de processamento (gravação
// automática) e pela action de conferência (gravação com um clique). As regras
// são as MESMAS dos formulários da ficha — registrarExame, registrarAusencia,
// registrarCertificado e criarDocumento (lib/actions/rh-sst.ts,
// rh-ausencias.ts, rh-documentos.ts) —; o que muda é de onde vêm os campos (a
// leitura da IA) e que o arquivo é a FATIA da pessoa, nunca o original.
//
// empresaId é SEMPRE o da ficha. O CNPJ da tela de onde o arquivo foi enviado
// só decide quem pode ver a fila — é a regra do RegistrarExameDialog e o
// motivo do incidente de 22/08 (AGENTS.md).
//
// A fatia vai para Arquivo.conteudo, como os anexos dos formulários da ficha:
// são 1-2 páginas, e assim excluir o registro pela ficha apaga o arquivo junto
// (no Blob, a fatia ficaria órfã — as exclusões da ficha não limpam o Blob).
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { registrarAuditoria } from "@/lib/audit";
import { calcularValidade } from "@/lib/conformidade";
import { contarDiasCorridos } from "@/lib/ferias";
import { competenciaUTC, fimDaCompetencia, formatarCompetencia } from "@/lib/constants-folha";
import { TAMANHO_MAXIMO_ANEXO, tipoAusenciaLabel } from "@/lib/constants-dp";
import { normaLabel, tipoExameLabel, validadePadraoDoExame } from "@/lib/constants-sst";
import { dataUTC, formatarData, somarDiasUTC } from "@/lib/datas";
import { DESTINO, destinoDoTipo, tipoCaixaLabel, type TipoCaixa } from "./tipos";
import type { CamposLidos } from "./extracao";

export type Ficha = {
  id: string;
  empresaId: string;
  nome: string;
  ativo: boolean;
  posicaoId: string | null;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
};

type Cliente = Prisma.TransactionClient | typeof prisma;

export function dataDe(texto: string | null): Date | null {
  if (!texto) return null;
  const [a, m, d] = texto.split("-").map(Number);
  return dataUTC(a, m, d);
}

export function competenciaDe(texto: string | null): Date | null {
  if (!texto) return null;
  const [a, m] = texto.split("-").map(Number);
  return competenciaUTC(a, m);
}

/** A data a que o documento se refere — decide se uma ficha desligada ainda vale. */
export function dataDeReferencia(c: CamposLidos): Date | null {
  return (
    competenciaDe(c.competencia) ??
    dataDe(c.dataDocumento) ??
    dataDe(c.dataInicio) ??
    (c.anoCalendario ? dataUTC(c.anoCalendario, 12, 31) : null)
  );
}

/** O ano inteiro que um informe de rendimentos cobre (ver identificar: quem saiu no meio do ano). */
export function periodoDeReferencia(tipo: TipoCaixa, c: CamposLidos): { inicio: Date; fim: Date } | null {
  if (tipo === "INFORME_RENDIMENTOS" && c.anoCalendario) {
    return { inicio: dataUTC(c.anoCalendario, 1, 1), fim: dataUTC(c.anoCalendario, 12, 31) };
  }
  return null;
}

/** Período do atestado: fim lido, ou início + dias − 1. */
export function periodoDoAtestado(c: CamposLidos): { inicio: Date; fim: Date } | null {
  const inicio = dataDe(c.dataInicio);
  if (!inicio) return null;
  const fim = dataDe(c.dataFim) ?? (c.dias ? somarDiasUTC(inicio, c.dias - 1) : null);
  return fim && fim >= inicio ? { inicio, fim } : null;
}

/**
 * A chave de "é o mesmo documento" do que vem da folha (índice único parcial
 * em DocumentoColaborador). Contracheque sem tipo de folha lido é o MENSAL — é
 * o caso de 11 dos 12 meses; adiantamento e 13º vêm escritos.
 */
export function chaveDedupe(tipo: TipoCaixa, c: CamposLidos): string | null {
  switch (tipo) {
    case "CONTRACHEQUE":
      return c.competencia ? `CONTRACHEQUE:${c.competencia}:${c.tipoFolha ?? "MENSAL"}` : null;
    case "INFORME_RENDIMENTOS":
      return c.anoCalendario ? `INFORME:${c.anoCalendario}` : null;
    case "RECIBO_FERIAS":
      return c.dataDocumento ? `RECIBO_FERIAS:${c.dataDocumento}` : null;
    case "TRCT":
      return "TRCT";
    default:
      return null;
  }
}

/**
 * O que o banco impede de gravar este item nesta ficha — mesma checagem do
 * formulário. Roda ANTES (o item vai à conferência com o motivo escrito) e de
 * novo DENTRO da transação da gravação, com a ficha travada.
 */
export async function impedimentosNoBanco(
  tipo: TipoCaixa,
  c: CamposLidos,
  ficha: Ficha,
  db: Cliente = prisma,
): Promise<string[]> {
  const motivos: string[] = [];
  if ((tipo === "TRCT" || (tipo === "ASO" && c.asoTipo === "DEMISSIONAL")) && ficha.ativo) {
    motivos.push("A pessoa ainda está ativa no sistema — registre o desligamento (ou confira se é esta ficha).");
  }
  switch (DESTINO[tipo]) {
    case "EXAME": {
      const realizadoEm = dataDe(c.dataDocumento);
      if (realizadoEm && c.asoTipo) {
        const igual = await db.exameOcupacional.findFirst({
          where: { colaboradorId: ficha.id, tipo: c.asoTipo, realizadoEm },
          select: { id: true },
        });
        if (igual) motivos.push(`Este ASO (${tipoExameLabel(c.asoTipo).toLowerCase()} de ${formatarData(realizadoEm)}) já está na ficha.`);
      }
      break;
    }
    case "CERTIFICADO_NR": {
      const realizadoEm = dataDe(c.dataDocumento);
      if (realizadoEm && c.norma) {
        const igual = await db.certificadoNR.findFirst({
          where: { colaboradorId: ficha.id, norma: c.norma, realizadoEm },
          select: { id: true },
        });
        if (igual) motivos.push(`Esta ${c.norma} de ${formatarData(realizadoEm)} já está na ficha.`);
      }
      break;
    }
    case "AUSENCIA": {
      const periodo = periodoDoAtestado(c);
      if (periodo) {
        if (contarDiasCorridos(periodo.inicio, periodo.fim) > 365) motivos.push("Período do atestado muito longo — confira as datas.");
        const sobreposta = await db.ausencia.findFirst({
          where: {
            colaboradorId: ficha.id,
            status: { in: ["PENDENTE", "APROVADA"] },
            dataInicio: { lte: periodo.fim },
            dataFim: { gte: periodo.inicio },
          },
          select: { dataInicio: true, dataFim: true },
        });
        if (sobreposta) {
          motivos.push(
            `Já há uma ausência de ${formatarData(sobreposta.dataInicio)} a ${formatarData(sobreposta.dataFim)} nesse período (talvez o mesmo atestado).`,
          );
        }
      }
      break;
    }
    case "DOSSIE": {
      const chave = chaveDedupe(tipo, c);
      if (chave) {
        const igual = await db.documentoColaborador.findFirst({
          where: { colaboradorId: ficha.id, chaveDedupe: chave },
          select: { id: true },
        });
        if (igual) {
          const ref = competenciaDe(c.competencia);
          motivos.push(`${tipoCaixaLabel(tipo)}${ref ? ` de ${formatarCompetencia(ref)}` : ""} desta pessoa já está no Dossiê.`);
        }
      } else {
        const emitidoEm = dataDe(c.dataDocumento);
        if (emitidoEm) {
          const igual = await db.documentoColaborador.findFirst({
            where: { colaboradorId: ficha.id, tipo, emitidoEm },
            select: { id: true },
          });
          if (igual) motivos.push(`${tipoCaixaLabel(tipo)} emitido em ${formatarData(emitidoEm)} já está no Dossiê.`);
        }
      }
      if (tipo === "CONTRACHEQUE") {
        const ref = competenciaDe(c.competencia);
        // Contracheque de um mês em que a pessoa não trabalhava aqui é sinal
        // de ficha errada (recontratação, transferência de CNPJ).
        if (ref && ficha.dataAdmissao && ficha.dataAdmissao > fimDaCompetencia(ref)) {
          motivos.push(`A competência ${formatarCompetencia(ref)} é anterior à admissão desta ficha.`);
        }
        if (ref && ficha.dataDesligamento && ficha.dataDesligamento < ref) {
          motivos.push(`A competência ${formatarCompetencia(ref)} é posterior ao desligamento desta ficha.`);
        }
      }
      break;
    }
    default:
      break;
  }
  return motivos;
}

/**
 * Só para a gravação AUTOMÁTICA: o que não impede o RH de gravar, mas pede o
 * olho dele. Documento pessoal sem data e sem chave (RG, CPF, CTPS...) não tem
 * como ser reconhecido como "o mesmo" — se a ficha já tem um do mesmo tipo, o
 * contador pode só ter reenviado.
 */
export async function avisosNoBanco(tipo: TipoCaixa, c: CamposLidos, ficha: Ficha, db: Cliente = prisma): Promise<string[]> {
  if (DESTINO[tipo] !== "DOSSIE" || chaveDedupe(tipo, c) || dataDe(c.dataDocumento)) return [];
  const existente = await db.documentoColaborador.findFirst({ where: { colaboradorId: ficha.id, tipo }, select: { id: true } });
  return existente ? [`Já há ${tipoCaixaLabel(tipo)} no Dossiê desta pessoa — confira se é outro documento ou o mesmo reenviado.`] : [];
}

export type Gravacao = { ok: true; entidade: string; id: string } | { ok: false; error: string };

export async function gravarItem(params: {
  tipo: TipoCaixa;
  campos: CamposLidos;
  ficha: Ficha;
  fatia: { bytes: Uint8Array<ArrayBuffer>; nome: string; mimeType: string };
  /**
   * As páginas da fatia são só desta pessoa (paginasSoDele, ou o RH conferiu
   * olhando). É invariante DO GRAVADOR, não só da decisão automática: nenhum
   * caminho — automático ou manual — publica no portal um arquivo com página
   * de outra pessoa.
   */
  paginasExclusivas: boolean;
  usuario: { id: string | null; nome: string | null };
  origem: { recebidoId: string; itemId: string; arquivo: string; paginaInicio: number; paginaFim: number; enviadoPor: string | null };
  automatico: boolean;
  chaveMatch: string;
  confianca: number;
}): Promise<Gravacao> {
  const { tipo, campos: c, ficha, usuario } = params;
  const destino = destinoDoTipo(tipo, params.automatico);
  if (!destino) return { ok: false, error: "Este tipo de documento não tem lugar automático no sistema." };
  if ((destino === "DOSSIE" || destino === "AUSENCIA") && !params.paginasExclusivas) {
    return {
      ok: false,
      error: "As páginas deste documento têm dados de outra pessoa — não dá para entregar este arquivo no portal.",
    };
  }
  if (params.fatia.bytes.byteLength > TAMANHO_MAXIMO_ANEXO) {
    return { ok: false, error: "As páginas desta pessoa passam de 4 MB — separe o arquivo e anexe pela ficha." };
  }

  const origemTexto = `Caixa de documentos: ${params.origem.arquivo}, pág. ${params.origem.paginaInicio}${params.origem.paginaFim !== params.origem.paginaInicio ? `–${params.origem.paginaFim}` : ""}.`;
  const agora = new Date();

  try {
    const criado = await prisma.$transaction(async (tx) => {
      // Uma gravação por pessoa por vez: duas abas (ou a leitura automática e
      // um clique na conferência) não gravam o mesmo documento duas vezes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ficha.id}))`;
      const impedimentos = await impedimentosNoBanco(tipo, c, ficha, tx);
      if (impedimentos.length > 0) throw new ErroDeGravacao(impedimentos.join(" "));

      const arquivo = await tx.arquivo.create({
        data: {
          empresaId: ficha.empresaId,
          nome: params.fatia.nome,
          mimeType: params.fatia.mimeType,
          tamanhoBytes: params.fatia.bytes.byteLength,
          conteudo: params.fatia.bytes,
          criadoPorId: usuario.id,
          criadoPorNome: usuario.nome,
        },
        select: { id: true },
      });

      let registro: { entidade: string; id: string; resumo: string };
      switch (destino) {
        case "EXAME": {
          const realizadoEm = dataDe(c.dataDocumento)!;
          const validoAte = dataDe(c.validoAte) ?? calcularValidade(realizadoEm, validadePadraoDoExame(c.asoTipo!));
          if (validoAte && validoAte < realizadoEm) throw new ErroDeGravacao("A validade não pode ser anterior à realização.");
          const exame = await tx.exameOcupacional.create({
            data: {
              empresaId: ficha.empresaId,
              colaboradorId: ficha.id,
              tipo: c.asoTipo!,
              realizadoEm,
              validoAte,
              resultado: c.asoResultado!,
              restricoes: c.asoResultado === "APTO_COM_RESTRICAO" ? c.restricoes : null,
              medico: c.medico,
              crm: c.crm,
              clinica: c.clinica,
              observacoes: origemTexto,
              arquivoId: arquivo.id,
              criadoPorId: usuario.id,
              criadoPorNome: usuario.nome,
            },
            select: { id: true },
          });
          registro = {
            entidade: "ExameOcupacional",
            id: exame.id,
            resumo: `ASO ${tipoExameLabel(c.asoTipo!).toLowerCase()} de ${ficha.nome} em ${formatarData(realizadoEm)} — ${c.asoResultado!.toLowerCase().replace(/_/g, " ")}.`,
          };
          break;
        }
        case "AUSENCIA": {
          const periodo = periodoDoAtestado(c)!;
          // `dias` é sempre recalculado das datas, como no formulário — nunca
          // o número que a IA leu.
          const dias = contarDiasCorridos(periodo.inicio, periodo.fim);
          const ausencia = await tx.ausencia.create({
            data: {
              empresaId: ficha.empresaId,
              colaboradorId: ficha.id,
              tipo: "ATESTADO",
              dataInicio: periodo.inicio,
              dataFim: periodo.fim,
              dias,
              // Atestado médico é abonado por padrão (TIPOS_AUSENCIA); nasce
              // PENDENTE e segue para Aprovações, como pelo formulário.
              abonada: true,
              profissional: c.medico,
              registroProfissional: c.crm,
              observacoes: origemTexto,
              arquivoId: arquivo.id,
              registradoPorId: usuario.id,
              registradoPorNome: usuario.nome,
            },
            select: { id: true },
          });
          registro = {
            entidade: "Ausencia",
            id: ausencia.id,
            resumo: `${tipoAusenciaLabel("ATESTADO")} de ${ficha.nome}: ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)} (${dias} dia(s)).`,
          };
          break;
        }
        case "CERTIFICADO_NR": {
          const realizadoEm = dataDe(c.dataDocumento)!;
          const requisito = ficha.posicaoId
            ? await tx.requisitoNR.findUnique({
                where: { posicaoId_norma: { posicaoId: ficha.posicaoId, norma: c.norma! } },
                select: { validadeMeses: true },
              })
            : null;
          // Mesma ordem do formulário: data impressa; senão a periodicidade do
          // requisito da função; sem requisito, sem validade.
          const validoAte = dataDe(c.validoAte) ?? calcularValidade(realizadoEm, requisito?.validadeMeses ?? null);
          if (validoAte && validoAte < realizadoEm) throw new ErroDeGravacao("A validade não pode ser anterior à realização.");
          const cert = await tx.certificadoNR.create({
            data: {
              empresaId: ficha.empresaId,
              colaboradorId: ficha.id,
              norma: c.norma!,
              realizadoEm,
              validoAte,
              cargaHoraria: c.cargaHoraria,
              observacoes: origemTexto,
              arquivoId: arquivo.id,
              criadoPorId: usuario.id,
              criadoPorNome: usuario.nome,
            },
            select: { id: true },
          });
          registro = {
            entidade: "CertificadoNR",
            id: cert.id,
            resumo: `${normaLabel(c.norma!)} de ${ficha.nome} registrada (${formatarData(realizadoEm)}${validoAte ? `, válida até ${formatarData(validoAte)}` : ""}).`,
          };
          break;
        }
        case "DOSSIE": {
          const ref = tipo === "CONTRACHEQUE" ? competenciaDe(c.competencia) : null;
          // O portal mostra a descrição do documento: é nela que a pessoa lê
          // de que mês é o contracheque.
          const descricao =
            tipo === "CONTRACHEQUE" && ref
              ? `Competência ${formatarCompetencia(ref)}${c.tipoFolha && c.tipoFolha !== "MENSAL" ? ` (${ROTULO_FOLHA[c.tipoFolha] ?? c.tipoFolha})` : ""}`
              : tipo === "INFORME_RENDIMENTOS" && c.anoCalendario
                ? `Ano-calendário ${c.anoCalendario}`
                : c.descricao;
          const emitidoEm = dataDe(c.dataDocumento);
          const validoAte = dataDe(c.validoAte);
          if (emitidoEm && validoAte && validoAte < emitidoEm) throw new ErroDeGravacao("A validade não pode ser anterior à emissão.");
          const doc = await tx.documentoColaborador.create({
            data: {
              empresaId: ficha.empresaId,
              colaboradorId: ficha.id,
              tipo: tipo === "OUTRO_DO_COLABORADOR" ? "OUTRO" : tipo,
              descricao,
              emitidoEm,
              validoAte,
              competencia: ref,
              chaveDedupe: chaveDedupe(tipo, c),
              observacoes: origemTexto,
              arquivoId: arquivo.id,
              // Lançado pelo RH (não é envio do portal): já nasce conferido.
              origem: "RH",
              conferidoEm: agora,
              conferidoPorNome: usuario.nome,
              criadoPorId: usuario.id,
              criadoPorNome: usuario.nome,
            },
            select: { id: true },
          });
          registro = {
            entidade: "DocumentoColaborador",
            id: doc.id,
            resumo: `${tipo === "OUTRO_DO_COLABORADOR" ? "Documento" : tipoCaixaLabel(tipo)} de ${ficha.nome}${descricao ? ` (${descricao})` : ""} guardado no Dossiê.`,
          };
          break;
        }
      }

      // O item da Caixa vira GRAVADO na MESMA transação do destino: não existe
      // destino gravado com item ainda "gravando", nem o contrário.
      const marcado = await tx.itemDocumentoRecebido.updateMany({
        where: { id: params.origem.itemId, status: "GRAVANDO" },
        data: {
          status: "GRAVADO",
          colaboradorId: ficha.id,
          chaveMatch: params.chaveMatch,
          destinoEntidade: registro.entidade,
          destinoId: registro.id,
          resolvidoPorNome: params.automatico ? "Leitura automática" : usuario.nome,
          resolvidoEm: agora,
          motivo: null,
          // CPF e PIS saem: o destino já guarda a pessoa. Os campos lidos
          // ficam enquanto o "Desfazer" existir (o original ainda guardado).
          cpfLido: null,
          pisLido: null,
        },
      });
      if (marcado.count !== 1) throw new ErroDeGravacao("Este documento acabou de ser resolvido em outra tela.");
      // Mexer num item renova o prazo de guarda do original (limparCaixa).
      await tx.documentoRecebido.updateMany({ where: { id: params.origem.recebidoId }, data: { updatedAt: agora } });
      return registro;
    });

    await registrarAuditoria({
      empresaId: ficha.empresaId,
      acao: "CRIAR",
      entidade: criado.entidade,
      entidadeId: criado.id,
      resumo: `${criado.resumo} ${params.automatico ? "Gravado pela Caixa de documentos (leitura automática)." : "Conferido na Caixa de documentos."}`,
      // Nada de CPF, CID ou valores: só de onde veio e como a pessoa foi achada.
      detalhes: {
        caixa: params.origem.recebidoId,
        item: params.origem.itemId,
        paginas: [params.origem.paginaInicio, params.origem.paginaFim],
        enviadoPor: params.origem.enviadoPor,
        chaveMatch: params.chaveMatch,
        automatico: params.automatico,
        confianca: Math.round(params.confianca * 100) / 100,
      },
    });

    try {
      revalidatePath(`/rh/${ficha.empresaId}/colaboradores/${ficha.id}`);
    } catch {
      // Fora de uma requisição do Next (script, smoke) não há cache a limpar;
      // a gravação já foi feita e não pode virar "erro" por isso.
    }
    return { ok: true, entidade: criado.entidade, id: criado.id };
  } catch (e) {
    if (e instanceof ErroDeGravacao) return { ok: false, error: e.message };
    // Índice único de chaveDedupe: a corrida que a trava não pegou.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "Este documento já está gravado para esta pessoa." };
    }
    console.error("[caixa-documentos] gravação", e);
    return { ok: false, error: "Não foi possível gravar — tente de novo." };
  }
}

const ROTULO_FOLHA: Record<string, string> = {
  ADIANTAMENTO: "adiantamento",
  DECIMO_TERCEIRO: "13º salário",
  FERIAS: "férias",
  COMPLEMENTAR: "complementar",
  PLR: "PLR",
};

class ErroDeGravacao extends Error {}
