"use server";

// Caixa de documentos — o que o RH faz na fila: gravar com um clique o que a
// leitura automática deixou para conferir, descartar, desfazer uma gravação e
// mandar ler de novo. A leitura em si roda pelas rotas de
// app/api/rh/[empresaId]/caixa-documentos (ver lá o porquê).
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { apenasDigitosCnpj } from "@/lib/cnpj";
import type { ActionResult } from "@/lib/constants";
import { alcancaEscopo, type UsuarioCaixa } from "@/lib/caixa-documentos/acesso";
import { normalizarCampos, type CamposLidos, type InventarioPaginas } from "@/lib/caixa-documentos/extracao";
import { conferenciaDasPaginas, faltasParaGravar, janelaDoItem, ocupaAsPaginas } from "@/lib/caixa-documentos/decidir";
import { gravarItem, type Ficha } from "@/lib/caixa-documentos/gravar";
import {
  apagarOriginal,
  bytesDoArquivo,
  fatiaDoItem,
  lerDados,
  marcasDoItem,
  paginasLidas,
  tocarRecebido,
  travarRecebido,
} from "@/lib/caixa-documentos/processar";
import { marcasDe } from "@/lib/caixa-documentos/sigilo";
import { MSG_PROVA_DE_RECEBIMENTO, recibosConfirmadosTravando } from "@/lib/contracheques/protecao";
import {
  JANELA_PAGINAS,
  VALORES_TIPO_CAIXA,
  destinoDoTipo,
  tipoCaixaLabel,
  visivelNoPortal,
  type TipoCaixa,
} from "@/lib/caixa-documentos/tipos";

async function carregar(empresaId: string, itemId: string) {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const item = await prisma.itemDocumentoRecebido.findFirst({
    where: { id: itemId, recebido: { empresaId } },
    include: { recebido: true },
  });
  if (!item || !(await alcancaEscopo(user, item.recebido.empresasEscopo))) return null;
  return { user, item };
}

function revalidar(empresaId: string) {
  revalidatePath(`/rh/${empresaId}/caixa-documentos`);
}

/**
 * Grava um item da conferência com o que o RH confirmou (pessoa, tipo,
 * campos, páginas). Mesmas regras da gravação automática — o gravador é o
 * mesmo — mais as travas do que só uma pessoa pode decidir: empresa diferente
 * da impressa no documento e páginas que a IA achou com mais de uma pessoa.
 */
export async function confirmarItem(empresaId: string, itemId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { user, item } = carregado;
  const recebido = item.recebido;
  if (item.status !== "CONFERIR") return { ok: false, error: "Este documento já foi resolvido." };

  const tipo = String(formData.get("tipo") ?? "") as TipoCaixa;
  if (!VALORES_TIPO_CAIXA.includes(tipo) || destinoDoTipo(tipo, false) === null) {
    return { ok: false, error: "Escolha o tipo de documento." };
  }

  const colaboradorId = String(formData.get("colaboradorId") ?? "");
  const colaborador = await prisma.colaborador.findFirst({
    where: {
      id: colaboradorId,
      empresaId: { in: recebido.empresasEscopo },
      empresa: { ativo: true },
    },
    select: {
      id: true,
      empresaId: true,
      nome: true,
      ativo: true,
      posicaoId: true,
      dataAdmissao: true,
      dataDesligamento: true,
      cpf: true,
      pis: true,
      empresa: { select: { cnpj: true } },
    },
  });
  if (!colaborador) return { ok: false, error: "Escolha a pessoa." };

  const marcasDaPessoa = marcasDe(colaborador.cpf, colaborador.pis);

  // CNPJ impresso de empresa cadastrada FORA do escopo do arquivo: só grava
  // se o CPF/PIS lido é o desta ficha (o informe traz o CNPJ da matriz como
  // fonte pagadora). Sem isso, seria o documento de uma empresa indo parar na
  // ficha de um homônimo de outra (a classe do 22/08).
  const oLidoEDaFicha = marcasDoItem(item).some((m) => marcasDaPessoa.includes(m));
  if (item.cnpjLido && !oLidoEDaFicha) {
    const empresas = await prisma.empresa.findMany({
      where: { cnpj: { not: null } },
      select: { id: true, cnpj: true, ativo: true },
    });
    const doDocumento = empresas.find((e) => apenasDigitosCnpj(e.cnpj!) === item.cnpjLido);
    if (doDocumento && !recebido.empresasEscopo.includes(doDocumento.id)) {
      return {
        ok: false,
        error: "O documento é de uma empresa fora do alcance deste arquivo — não pode ser gravado daqui.",
      };
    }
  }

  // Campos: o que veio do formulário por cima do que a IA leu, passando pela
  // MESMA limpeza (datas que não existem viram vazio, enum fora da lista some).
  const lidos = lerDados(item.dados).campos;
  const doForm: Record<string, unknown> = {};
  for (const chave of Object.keys(lidos) as (keyof CamposLidos)[]) {
    const v = formData.get(chave);
    if (v === null) continue;
    const texto = String(v).trim();
    doForm[chave] = ["anoCalendario", "dias", "cargaHoraria"].includes(chave) ? (texto ? Number(texto) : 0) : texto;
  }
  const campos = normalizarCampos({ ...lidos, ...doForm });
  const faltas = faltasParaGravar(tipo, campos);
  if (faltas.length > 0) return { ok: false, error: faltas.join(" ") };

  const total = recebido.paginas ?? 1;
  const de = Number(formData.get("paginaInicio") ?? item.paginaInicio);
  const ate = Number(formData.get("paginaFim") ?? item.paginaFim);
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 1 || ate < de || ate > total) {
    return { ok: false, error: `Páginas inválidas (o arquivo tem ${total}).` };
  }
  // Só o que o RH pôde ver (a rota de páginas mostra a mesma janela, presa
  // ao que a leitura apontou — não ao intervalo atual, que muda).
  const janela = janelaDoItem(paginasLidas(item), total);
  if (de < janela.de || ate > janela.ate) {
    return {
      ok: false,
      error: `Dá para ajustar até ${JANELA_PAGINAS} páginas antes ou depois das que a leitura apontou.`,
    };
  }

  // CNPJ impresso no documento ≠ empresa da ficha escolhida: só com
  // confirmação explícita (vai para a auditoria).
  const cnpjDaFicha = colaborador.empresa.cnpj ? apenasDigitosCnpj(colaborador.empresa.cnpj) : null;
  const empresaDiferente = !!item.cnpjLido && item.cnpjLido !== cnpjDaFicha;
  if (empresaDiferente && formData.get("confirmoEmpresa") !== "on") {
    return {
      ok: false,
      error: "O CNPJ impresso no documento é de outra empresa. Marque a confirmação se esta é mesmo a ficha certa.",
    };
  }

  // Páginas: com documento de outra pessoa nelas, nada vai ao portal — sem
  // exceção, nem com confirmação. Descartar o item da outra pessoa não libera
  // a página (ocupaAsPaginas): o contracheque dela continua impresso ali. Se
  // só o inventário ficou em dúvida, o RH, que está vendo as páginas, confirma.
  const vaiAoPortal = visivelNoPortal(tipo) || tipo === "OUTRO_DO_COLABORADOR";
  const outros = await prisma.itemDocumentoRecebido.findMany({
    where: { recebidoId: recebido.id, id: { not: item.id } },
    select: {
      paginaInicio: true,
      paginaFim: true,
      tipo: true,
      status: true,
      colaboradorId: true,
      nomeLido: true,
      motivo: true,
      cpfLido: true,
      pisLido: true,
      dados: true,
    },
  });
  const pessoa = { id: colaborador.id, marcas: marcasDaPessoa };
  const sobrepoe = outros.some(
    (o) => o.paginaInicio <= ate && o.paginaFim >= de && ocupaAsPaginas({ ...o, marcas: marcasDoItem(o) }, pessoa),
  );
  const paginas = conferenciaDasPaginas(
    de,
    ate,
    (recebido.inventarioPaginas as InventarioPaginas | null) ?? null,
    marcasDaPessoa,
    !!colaborador.cpf && !!colaborador.pis,
  );
  if (vaiAoPortal && (sobrepoe || paginas === "OUTRA_PESSOA")) {
    return {
      ok: false,
      error:
        "Estas páginas têm documento de outra pessoa — o arquivo iria para o portal desta com dados de outra. Peça ao contador o arquivo com um documento por página, ou anexe pela ficha.",
    };
  }
  if (vaiAoPortal && paginas === "DUVIDA" && formData.get("confirmoPaginas") !== "on") {
    return {
      ok: false,
      error: "A leitura não confirmou que estas páginas são só desta pessoa. Olhe as páginas e marque a confirmação.",
    };
  }

  if (!recebido.arquivoId)
    return {
      ok: false,
      error: "O arquivo original não está mais guardado — anexe pela ficha.",
    };
  const arquivo = await prisma.arquivo.findUnique({
    where: { id: recebido.arquivoId },
    select: { blobUrl: true, conteudo: true },
  });
  const original = arquivo ? await bytesDoArquivo(arquivo) : null;
  if (!original)
    return {
      ok: false,
      error: "Não consegui abrir o arquivo original — tente de novo.",
    };
  // A fatia sai ANTES de pegar o item: se separar as páginas falhar, o item
  // continua na conferência em vez de ficar preso em "gravando".
  const ficha: Ficha = colaborador;
  let fatia: Awaited<ReturnType<typeof fatiaDoItem>>;
  try {
    fatia = await fatiaDoItem(recebido, original, de, ate, tipo, ficha.nome);
  } catch {
    return {
      ok: false,
      error: "Não consegui separar estas páginas do arquivo.",
    };
  }

  // O arquivo tem de continuar vivo (não descartado, original guardado) no
  // instante em que o item é pego: senão o descarte do arquivo apagaria o
  // original entre a checagem e a gravação, e não haveria "Desfazer".
  const pego = await prisma.itemDocumentoRecebido.updateMany({
    where: { id: item.id, status: "CONFERIR", recebido: { status: { not: "DESCARTADO" }, arquivoId: { not: null } } },
    data: { status: "GRAVANDO", paginaInicio: de, paginaFim: ate, tipo },
  });
  if (pego.count !== 1)
    return {
      ok: false,
      error: "Este documento acabou de ser resolvido em outra tela.",
    };

  const devolver = () =>
    prisma.itemDocumentoRecebido.updateMany({
      where: { id: item.id, status: "GRAVANDO" },
      data: {
        status: "CONFERIR",
        paginaInicio: item.paginaInicio,
        paginaFim: item.paginaFim,
        tipo: item.tipo,
      },
    });
  let gravado: Awaited<ReturnType<typeof gravarItem>>;
  try {
    gravado = await gravarItem({
      tipo,
      campos,
      ficha,
      fatia,
      paginasExclusivas: true,
      usuario: { id: user.id, nome: user.name ?? null },
      origem: {
        recebidoId: recebido.id,
        itemId: item.id,
        arquivo: recebido.nome,
        paginaInicio: de,
        paginaFim: ate,
        enviadoPor: recebido.criadoPorNome,
      },
      automatico: false,
      chaveMatch: empresaDiferente ? "MANUAL_OUTRA_EMPRESA" : "MANUAL",
      confianca: item.confianca,
    });
  } catch (e) {
    console.error("[caixa-documentos] confirmar", e);
    await devolver();
    return {
      ok: false,
      error: "Falha ao gravar — o documento continua na conferência. Tente de novo.",
    };
  }
  if (!gravado.ok) {
    await devolver();
    return { ok: false, error: gravado.error };
  }

  revalidar(empresaId);
  return { ok: true };
}

export async function descartarItem(empresaId: string, itemId: string): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { item } = carregado;
  const r = await prisma.itemDocumentoRecebido.updateMany({
    where: { id: item.id, status: { in: ["CONFERIR", "PENDENTE"] } },
    data: {
      status: "DESCARTADO",
      cpfLido: null,
      pisLido: null,
      // Só as marcas do CPF/PIS (não voltam a ser número): a página continua
      // "desta pessoa" para ocupaAsPaginas, mesmo descartada.
      dados: { marcas: marcasDoItem(item) },
      resolvidoPorNome: carregado.user.name ?? null,
      resolvidoEm: new Date(),
    },
  });
  if (r.count !== 1) return { ok: false, error: "Este documento já foi resolvido." };
  await tocarRecebido(item.recebidoId);
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ItemDocumentoRecebido",
    entidadeId: item.id,
    resumo: `Caixa de documentos: ${tipoCaixaLabel(item.tipo)} (pág. ${item.paginaInicio}) de "${item.recebido.nome}" descartado.`,
  });
  revalidar(empresaId);
  return { ok: true };
}

/** Descarta de uma vez as páginas que a IA disse não serem de ninguém (capa, resumo, guia). */
export async function descartarNaoColaborador(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({
    where: { id: recebidoId, empresaId },
  });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  const r = await prisma.itemDocumentoRecebido.updateMany({
    where: { recebidoId, tipo: "NAO_E_DE_COLABORADOR", status: "CONFERIR" },
    data: {
      status: "DESCARTADO",
      nomeLido: null,
      cpfLido: null,
      pisLido: null,
      dados: {},
      resolvidoPorNome: user.name ?? null,
      resolvidoEm: new Date(),
    },
  });
  if (r.count > 0) {
    await tocarRecebido(recebidoId);
    await registrarAuditoria({
      empresaId,
      acao: "EXCLUIR",
      entidade: "DocumentoRecebido",
      entidadeId: recebidoId,
      resumo: `Caixa de documentos: ${r.count} página(s) que não eram de colaborador descartada(s) em "${recebido.nome}".`,
    });
  }
  revalidar(empresaId);
  return { ok: true };
}

/**
 * Descarta o arquivo: o que falta conferir sai da fila. O que JÁ foi gravado
 * continua nas fichas (use "Desfazer" em cada um para tirar).
 */
export async function descartarRecebido(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({
    where: { id: recebidoId, empresaId },
  });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  if (recebido.processandoDesde && recebido.processandoDesde > new Date(Date.now() - 330_000)) {
    return {
      ok: false,
      error: "O arquivo está sendo lido agora — espere a rodada terminar.",
    };
  }
  // Um item sendo gravado agora terminaria GRAVADO num arquivo já sem
  // original — sem "Desfazer". Espera ele terminar.
  if (await prisma.itemDocumentoRecebido.count({ where: { recebidoId, status: "GRAVANDO" } })) {
    return { ok: false, error: "Um documento deste arquivo está sendo gravado agora — tente de novo em instantes." };
  }
  await prisma.$transaction([
    prisma.itemDocumentoRecebido.updateMany({
      where: { recebidoId, status: { in: ["CONFERIR", "PENDENTE"] } },
      data: {
        status: "DESCARTADO",
        cpfLido: null,
        pisLido: null,
        dados: {},
        resolvidoPorNome: user.name ?? null,
        resolvidoEm: new Date(),
      },
    }),
    prisma.documentoRecebido.update({
      where: { id: recebidoId },
      data: { status: "DESCARTADO", processandoDesde: null },
    }),
  ]);
  const gravados = await prisma.itemDocumentoRecebido.count({
    where: { recebidoId, status: "GRAVADO" },
  });
  // Sem nada gravado, o original não serve para mais nada (nem para desfazer).
  // Conferido de novo com a trava: um item pego para gravar no meio do
  // caminho segura o original.
  if (gravados === 0) await apagarOriginal(recebidoId, { itens: { none: { status: { in: ["GRAVANDO", "GRAVADO"] } } } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "DocumentoRecebido",
    entidadeId: recebidoId,
    resumo: `Caixa de documentos: arquivo "${recebido.nome}" descartado${gravados ? ` (${gravados} documento(s) já gravado(s) continuam nas fichas)` : ""}.`,
  });
  revalidar(empresaId);
  return { ok: true };
}

/** Arquivo em ERRO volta para a fila de leitura, do ponto onde parou. */
export async function tentarDeNovo(empresaId: string, recebidoId: string): Promise<ActionResult> {
  const user = (await requireEmpresaAccess(empresaId)) as unknown as UsuarioCaixa;
  const recebido = await prisma.documentoRecebido.findFirst({
    where: { id: recebidoId, empresaId },
  });
  if (!recebido || !(await alcancaEscopo(user, recebido.empresasEscopo))) return { ok: false, error: "Arquivo não encontrado." };
  if (!recebido.arquivoId)
    return {
      ok: false,
      error: "O arquivo original não está mais guardado — envie de novo.",
    };
  const r = await prisma.documentoRecebido.updateMany({
    where: { id: recebidoId, status: "ERRO" },
    data: {
      status: (recebido.paginas ?? 1) < recebido.proximaPagina ? "ROTEANDO" : recebido.proximaPagina > 1 ? "LENDO" : "PENDENTE",
      tentativas: 0,
      erro: null,
      processandoDesde: null,
    },
  });
  if (r.count !== 1) return { ok: false, error: "Este arquivo não está com erro." };
  revalidar(empresaId);
  return { ok: true };
}

/**
 * Desfaz uma gravação (automática ou manual): apaga o registro criado e o
 * arquivo da pessoa, e o documento volta para a conferência. Existe porque o
 * que vai ao Dossiê aparece no portal na hora — um engano precisa sair rápido.
 *
 * Tudo numa transação com a trava do arquivo (a mesma da faxina que apaga o
 * original): ou desfaz com o original ainda guardado, ou não desfaz.
 */
export async function desfazerItem(empresaId: string, itemId: string): Promise<ActionResult> {
  const carregado = await carregar(empresaId, itemId);
  if (!carregado) return { ok: false, error: "Documento não encontrado." };
  const { user, item } = carregado;
  if (item.status !== "GRAVADO" || !item.destinoEntidade || !item.destinoId) {
    return { ok: false, error: "Este documento não está gravado." };
  }
  const id = item.destinoId;
  const entidade = item.destinoEntidade;
  // O registro mudou na ficha depois de criado (outro arquivo, datas
  // corrigidas): apagar daqui jogaria fora o trabalho de alguém. Compara com
  // a criação DO PRÓPRIO registro — a hora do item vem de antes da transação.
  const editadoDepois = (r: { createdAt: Date; updatedAt: Date }) => r.updatedAt.getTime() - r.createdAt.getTime() > 1_000;

  class Recusa extends Error {}
  let empresaDoDestino: string;
  try {
    empresaDoDestino = await prisma.$transaction(async (tx) => {
      await travarRecebido(tx, item.recebidoId);
      const recebido = await tx.documentoRecebido.findUnique({ where: { id: item.recebidoId }, select: { arquivoId: true, status: true } });
      if (!recebido?.arquivoId) throw new Recusa("O arquivo original já não está guardado — exclua o registro pela ficha da pessoa.");

      const sumiu = "O registro já não existe (foi excluído pela ficha).";
      const editado = "O registro foi alterado na ficha depois de gravado — ajuste ou exclua pela ficha da pessoa.";
      let destino: { arquivoId: string | null; empresaId: string };
      let apagados: { count: number };
      switch (entidade) {
        case "ExameOcupacional": {
          const r = await tx.exameOcupacional.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true, createdAt: true, updatedAt: true } });
          if (!r) throw new Recusa(sumiu);
          if (editadoDepois(r)) throw new Recusa(editado);
          [destino, apagados] = [r, await tx.exameOcupacional.deleteMany({ where: { id } })];
          break;
        }
        case "CertificadoNR": {
          const r = await tx.certificadoNR.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true, createdAt: true, updatedAt: true } });
          if (!r) throw new Recusa(sumiu);
          if (editadoDepois(r)) throw new Recusa(editado);
          [destino, apagados] = [r, await tx.certificadoNR.deleteMany({ where: { id } })];
          break;
        }
        case "Ausencia": {
          const r = await tx.ausencia.findUnique({ where: { id }, select: { arquivoId: true, empresaId: true, status: true, createdAt: true, updatedAt: true } });
          if (!r) throw new Recusa(sumiu);
          // Aprovada já mexeu em folha/ponto: desfazer aqui esconderia isso.
          if (r.status !== "PENDENTE") throw new Recusa("A ausência já foi decidida em Aprovações — ajuste pela ficha da pessoa.");
          if (editadoDepois(r)) throw new Recusa(editado);
          [destino, apagados] = [r, await tx.ausencia.deleteMany({ where: { id, status: "PENDENTE" } })];
          break;
        }
        case "DocumentoColaborador": {
          const r = await tx.documentoColaborador.findUnique({
            where: { id },
            select: { arquivoId: true, empresaId: true, createdAt: true, updatedAt: true },
          });
          if (!r) throw new Recusa(sumiu);
          // O contracheque confirmado com foto é a prova de recebimento (recibo travado).
          if ((await recibosConfirmadosTravando(tx, { documentoId: id })) > 0) throw new Recusa(MSG_PROVA_DE_RECEBIMENTO);
          if (editadoDepois(r)) throw new Recusa(editado);
          [destino, apagados] = [r, await tx.documentoColaborador.deleteMany({ where: { id } })];
          break;
        }
        default:
          throw new Recusa(sumiu);
      }
      if (apagados.count !== 1) throw new Recusa(sumiu);
      if (destino.arquivoId) await tx.arquivo.deleteMany({ where: { id: destino.arquivoId } });

      // Cercado: só volta se ainda é ESTA gravação (dois cliques em "Desfazer").
      const voltou = await tx.itemDocumentoRecebido.updateMany({
        where: { id: item.id, status: "GRAVADO", destinoId: id },
        data: {
          status: "CONFERIR",
          // Sem pessoa marcada: quem desfaz quase sempre desfaz porque a
          // pessoa estava errada — ela não pode vir escolhida de novo.
          colaboradorId: null,
          destinoEntidade: null,
          destinoId: null,
          resolvidoPorNome: null,
          resolvidoEm: null,
          motivo: `Gravação desfeita por ${user.name ?? "RH"} — confira e grave de novo, ou descarte.`,
        },
      });
      if (voltou.count !== 1) throw new Recusa("Este documento acabou de ser desfeito em outra tela.");
      await tx.documentoRecebido.update({
        where: { id: item.recebidoId },
        data: { updatedAt: new Date(), ...(recebido.status === "DESCARTADO" ? { status: "CONCLUIDO" } : {}) },
      });
      return destino.empresaId;
    });
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, error: e.message };
    throw e;
  }

  await registrarAuditoria({
    empresaId: empresaDoDestino,
    acao: "EXCLUIR",
    entidade,
    entidadeId: id,
    resumo: `${tipoCaixaLabel(item.tipo)} gravado pela Caixa de documentos foi desfeito (volta para a conferência).`,
    detalhes: { caixa: item.recebidoId, item: item.id },
  });
  if (item.colaboradorId) revalidatePath(`/rh/${empresaDoDestino}/colaboradores/${item.colaboradorId}`);
  revalidar(empresaId);
  return { ok: true };
}
