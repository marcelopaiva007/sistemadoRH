"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
import { requireEmpresaAccess, requireRHAccess } from "@/lib/rh-auth-guard";
import { executarGestaoCiclo } from "@/lib/pesquisa-ciclo";
import { enviarUmConvite, enviosRestantesHoje, LIMITE_DIARIO_ENVIOS } from "@/lib/convites";
import { vinculoTelegramQuebrado, MSG_AGUARDANDO_NOVO_VINCULO } from "@/lib/pesquisa-numeros";
import { filtrarElegiveisPorVinculo, invalidarConvitesDeDesligados } from "@/lib/pesquisa-vinculo";
import {
  PERGUNTAS_NR01,
  TITULO_PESQUISA_NR01,
  DESCRICAO_PESQUISA_NR01,
} from "@/lib/nr01-modelo";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

/**
 * Igual ao ActionResult, mas com um texto de sucesso para a tela. Serve para as
 * ações cujo resultado não é óbvio olhando a lista depois — "gerou quantos?",
 * "quem saiu?" — em que um "pronto" genérico não diz o que mudou.
 */
type ResultadoComMensagem = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Todas as telas onde o número de convites aparece.
 *
 * Tirar alguém da pesquisa muda quatro telas ao mesmo tempo, e é fácil
 * revalidar só aquela em que o RH clicou: ele volta para a lista de pesquisas,
 * vê o total de antes e conclui que a exclusão não funcionou. Cada caminho
 * está escrito aqui em vez de confiar na revalidação do layout.
 */
function revalidarNumerosDaPesquisa(empresaId: string, pesquisaId: string) {
  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  revalidatePath(`/rh/${empresaId}/pesquisas`);
  revalidatePath(`/rh/${empresaId}/dashboard`);
  revalidatePath(`/rh/${empresaId}/relatorios`);
  // Headcount da empresa e do grupo — a exclusão desativa o cadastro.
  revalidatePath(`/rh/${empresaId}`, "layout");
  revalidatePath("/");
}

const STATUSES = ["DRAFT", "ACTIVE", "FINISHED", "ARCHIVED"] as const;
const TIPOS_PERGUNTA = ["LIKERT_5", "FREQ_0_4", "NPS_10", "MULTIPLE_CHOICE", "TEXT"] as const;
const DIMENSOES_GPTW = [
  "CREDIBILIDADE",
  "RESPEITO",
  "IMPARCIALIDADE",
  "ORGULHO",
  "CAMARADAGEM",
  "GERAL",
] as const;

const pesquisaSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título da pesquisa"),
  descricao: z.string().trim().optional(),
  anonima: z.coerce.boolean().default(true),
});

// `anonima` se decide na criação e não muda mais. A tela já trata o campo como
// imutável (dados-pesquisa-form.tsx só mostra "Anônima: sim/não" em texto), mas
// server action é endpoint HTTP: sem tirar o campo daqui, um POST direto viraria
// uma pesquisa anônima em identificada no meio da coleta — depois de o convite
// já ter prometido anonimato ao colaborador (lib/convites.ts). E como o valor
// vinha de `formData.get("anonima") === "true"`, campo ausente virava `false`:
// falhava abrindo, no sentido mais perigoso.
const pesquisaUpdateSchema = pesquisaSchema.omit({ anonima: true });

export async function createPesquisa(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireEmpresaAccess(empresaId);
  const parsed = pesquisaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    anonima: formData.get("anonima") === "on" || formData.get("anonima") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const pesquisa = await prisma.pesquisa.create({
    data: {
      // A pesquisa nasce vinculada a MARCA — e ao CNPJ so como registro de
      // onde foi criada. Ver o comentario de `marcaId` no schema.
      marcaId: await marcaDaEmpresa(empresaId),
      empresaId,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
      anonima: parsed.data.anonima,
      criadoPorId: user?.id ?? null,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  redirect(`/rh/${empresaId}/pesquisas/${pesquisa.id}`);
}

// Cria a Avaliação de Riscos Psicossociais (NR-01) completa para a empresa:
// pesquisa modelo "NR01" já com as 35 perguntas fixas (escala 0-4, dimensões e
// flags de inversão de lib/nr01-modelo.ts). Sempre anônima — requisito prático
// para respostas honestas em avaliação psicossocial; os agregados por
// setor/cargo saem dos snapshots.
export async function criarPesquisaNR01(empresaId: string): Promise<ActionResult> {
  const user = await requireEmpresaAccess(empresaId);

  const ano = new Date().getFullYear();
  const pesquisa = await prisma.pesquisa.create({
    data: {
      // A pesquisa nasce vinculada a MARCA — e ao CNPJ so como registro de
      // onde foi criada. Ver o comentario de `marcaId` no schema.
      marcaId: await marcaDaEmpresa(empresaId),
      empresaId,
      titulo: `${TITULO_PESQUISA_NR01} — ${ano}`,
      descricao: DESCRICAO_PESQUISA_NR01,
      modelo: "NR01",
      anonima: true,
      criadoPorId: user?.id ?? null,
      perguntas: {
        create: PERGUNTAS_NR01.map((p, index) => ({
          ordem: index,
          enunciado: p.enunciado,
          tipo: "FREQ_0_4",
          codigo: p.codigo,
          dimensao: p.dimensao,
          invertida: p.invertida,
          obrigatoria: true,
        })),
      },
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  redirect(`/rh/${empresaId}/pesquisas/${pesquisa.id}`);
}

// Exclui a campanha inteira: perguntas, opções, convites e respostas.
// Ordem explícita na transação para não depender do encadeamento de cascades
// do banco. Irreversível — a UI exige confirmação em duas etapas.
export async function deletePesquisa(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  await prisma.$transaction([
    prisma.respostaItem.deleteMany({ where: { resposta: { pesquisaId: id } } }),
    prisma.resposta.deleteMany({ where: { pesquisaId: id } }),
    prisma.surveyToken.deleteMany({ where: { pesquisaId: id } }),
    prisma.opcao.deleteMany({ where: { pergunta: { pesquisaId: id } } }),
    prisma.pergunta.deleteMany({ where: { pesquisaId: id } }),
    prisma.pesquisa.delete({ where: { id } }),
  ]);

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  redirect(`/rh/${empresaId}/pesquisas`);
}

export async function updatePesquisa(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = pesquisaUpdateSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.pesquisa.update({
    where: { id, empresaId },
    data: {
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  revalidatePath(`/rh/${empresaId}/pesquisas/${id}`);
  return { ok: true };
}

export async function alterarStatusPesquisa(
  empresaId: string,
  id: string,
  novoStatus: (typeof STATUSES)[number]
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  if (!STATUSES.includes(novoStatus)) return { ok: false, error: "Status inválido." };

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  if (novoStatus === "ACTIVE") {
    const perguntas = await prisma.pergunta.count({ where: { pesquisaId: id } });
    if (perguntas === 0) {
      return { ok: false, error: "Adicione pelo menos uma pergunta antes de ativar a pesquisa." };
    }
  }

  await prisma.pesquisa.update({
    where: { id, empresaId },
    data: {
      status: novoStatus,
      iniciadaEm: novoStatus === "ACTIVE" && !pesquisa.iniciadaEm ? new Date() : pesquisa.iniciadaEm,
      encerradaEm: novoStatus === "FINISHED" ? new Date() : pesquisa.encerradaEm,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  revalidatePath(`/rh/${empresaId}/pesquisas/${id}`);
  return { ok: true };
}

const opcaoSchema = z.object({
  texto: z.string().trim().min(1, "Informe o texto da opção"),
});

const perguntaSchema = z.object({
  enunciado: z.string().trim().min(3, "Informe o enunciado da pergunta"),
  tipo: z.enum(TIPOS_PERGUNTA),
  dimensaoGPTW: z.enum(DIMENSOES_GPTW).optional().nullable(),
  obrigatoria: z.boolean().default(true),
  opcoes: z.array(opcaoSchema).default([]),
});

const perguntasArraySchema = z.array(perguntaSchema).min(1, "Adicione pelo menos uma pergunta");

// Substitui o conjunto inteiro de perguntas+opções de uma pesquisa DRAFT —
// mais simples que reconciliar diffs linha a linha.
export async function salvarPerguntas(
  empresaId: string,
  pesquisaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id: pesquisaId, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };
  if (pesquisa.status !== "DRAFT") {
    return { ok: false, error: "Só é possível editar perguntas enquanto a pesquisa está em rascunho." };
  }
  if (pesquisa.modelo === "NR01") {
    return {
      ok: false,
      error:
        "As perguntas da Avaliação NR-01 são fixas (o cálculo da matriz de risco depende delas) e não podem ser editadas.",
    };
  }

  let perguntasRaw: unknown;
  try {
    perguntasRaw = JSON.parse(String(formData.get("perguntasJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Perguntas inválidas (JSON malformado)." };
  }
  const parsed = perguntasArraySchema.safeParse(perguntasRaw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    await tx.pergunta.deleteMany({ where: { pesquisaId } });
    for (const [index, pergunta] of parsed.data.entries()) {
      await tx.pergunta.create({
        data: {
          pesquisaId,
          ordem: index,
          enunciado: pergunta.enunciado,
          tipo: pergunta.tipo,
          dimensaoGPTW: pergunta.dimensaoGPTW ?? null,
          obrigatoria: pergunta.obrigatoria,
          opcoes:
            pergunta.tipo === "MULTIPLE_CHOICE"
              ? { create: pergunta.opcoes.map((o, i) => ({ ordem: i, texto: o.texto })) }
              : undefined,
        },
      });
    }
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: true };
}

export async function gerarConvites(empresaId: string, pesquisaId: string): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId: await marcaDaEmpresa(empresaId) },
  });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  // Convida a MARCA inteira, não o CNPJ onde a pesquisa nasceu. Era o que
  // faltava para a pesquisa ser da marca de fato: ela já aparecia para os
  // cinco CNPJs da LM Telecom, mas o convite só saía para quem estava no
  // CNPJ de criação — os outros quatro viam a pesquisa e nunca a recebiam.
  //
  // Vínculo ativo (RD-001): quem está com INSS/licença-maternidade/suspensão
  // vigente não entra aqui, mesmo com o cadastro ativo — ver lib/pesquisa-vinculo.ts.
  const colaboradores = await filtrarElegiveisPorVinculo(prisma, pesquisa.marcaId);

  // `skipDuplicates` sobre a unique [pesquisaId, colaboradorId] é o que torna
  // este botão seguro de clicar de novo: quem já tem convite não ganha outro,
  // quem foi EXCLUIDO não volta, e quem entrou depois da geração inicial entra
  // agora. É assim que a lista acompanha a base — sem ele, gerar de novo
  // duplicaria os 200 convites já enviados.
  const { count } = await prisma.surveyToken.createMany({
    data: colaboradores.map((c) => ({
      pesquisaId,
      colaboradorId: c.id,
      token: crypto.randomBytes(24).toString("base64url"),
    })),
    skipDuplicates: true,
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: true, message: count === 0 ? "Nenhum convite novo — a lista já está completa." : `${count} convite(s) novo(s) gerado(s).` };
}

/**
 * Tira alguém da pesquisa sem apagar o convite, e desativa o cadastro.
 *
 * Apagar o convite seria mais simples e estaria errado: "Gerar convites"
 * recriaria a pessoa na rodada seguinte, porque a única coisa que segura a
 * recriação é a linha existente na unique [pesquisaId, colaboradorId].
 * Marcando o status a exclusão gruda — e nenhum dos caminhos de envio (manual,
 * lote e automático) olha para EXCLUIDO, todos filtram PENDING/FAILED.
 *
 * O cadastro também sai do ar (ativo = false). O motivo de tirar alguém da
 * pesquisa é sempre o mesmo — não é funcionário —, e com o cadastro ativo essa
 * pessoa continuaria somando no número de colaboradores da empresa, nas
 * pendências, nos benefícios e nas férias: tirar da pesquisa e deixar no
 * headcount corrige um número e deixa o outro errado. Desativar, e não apagar,
 * porque a ficha continua valendo como registro e o RH reativa em
 * Colaboradores se tiver se enganado. A importação por planilha não desfaz
 * isso — o update do importador não toca em `ativo`.
 *
 * Quem já respondeu não pode ser excluído: a resposta anônima já está contada
 * nos agregados e não há como retirá-la, então tirar o convite só apagaria o
 * registro de que aquela pessoa participou.
 */
export async function excluirDaPesquisa(
  empresaId: string,
  tokenId: string,
  motivo?: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const token = await prisma.surveyToken.findFirst({
    where: { id: tokenId, pesquisa: { empresaId } },
    include: {
      colaborador: { select: { id: true, nome: true, ativo: true } },
      pesquisa: { select: { titulo: true } },
    },
  });
  if (!token) return { ok: false, error: "Convite não encontrado." };
  if (token.status === "RESPONDED") {
    return {
      ok: false,
      error: "Esta pessoa já respondeu — a resposta é anônima e não pode ser retirada dos resultados.",
    };
  }
  if (token.status === "EXCLUIDO") return { ok: true, message: "Já estava fora da pesquisa." };

  const desativouCadastro = token.colaborador.ativo;

  // As três escritas na mesma transação: cadastro desativado com convite ainda
  // pendente (aqui ou em outra pesquisa) é justamente o estado meio-termo que
  // esta ação existe para evitar.
  await prisma.$transaction(async (tx) => {
    await tx.surveyToken.update({
      where: { id: tokenId },
      data: { status: "EXCLUIDO", erro: motivo?.trim().slice(0, 200) || null },
    });
    if (desativouCadastro) {
      await tx.colaborador.update({ where: { id: token.colaborador.id }, data: { ativo: false } });
      // RD-001: desativar o cadastro aqui é um desligamento — expira também os
      // convites em aberto que essa pessoa tenha em QUALQUER outra pesquisa.
      await invalidarConvitesDeDesligados(tx, token.colaborador.id);
    }
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SurveyToken",
    entidadeId: tokenId,
    resumo:
      `${token.colaborador.nome} foi retirado(a) da pesquisa "${token.pesquisa.titulo}"` +
      (desativouCadastro ? " e o cadastro foi desativado." : "."),
  });

  revalidarNumerosDaPesquisa(empresaId, token.pesquisaId);
  return {
    ok: true,
    message: desativouCadastro
      ? `${token.colaborador.nome} saiu da pesquisa e o cadastro foi desativado.`
      : `${token.colaborador.nome} saiu da pesquisa.`,
  };
}

/**
 * Desfaz a exclusão: o convite volta a PENDING e entra no próximo envio.
 *
 * Não reativa o cadastro de propósito. Cadastro inativo não quer dizer só
 * "saiu da pesquisa" — pode ser desligamento —, e reativar por tabela
 * ressuscitaria um demitido no headcount, nos benefícios e nas férias. A ação
 * avisa quando é esse o caso; reativar é um clique em Colaboradores.
 */
export async function reincluirNaPesquisa(
  empresaId: string,
  tokenId: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const token = await prisma.surveyToken.findFirst({
    where: { id: tokenId, pesquisa: { empresaId }, status: "EXCLUIDO" },
    include: { colaborador: { select: { nome: true, ativo: true } } },
  });
  if (!token) return { ok: false, error: "Convite não encontrado ou não está excluído." };

  await prisma.surveyToken.update({
    where: { id: tokenId },
    data: { status: "PENDING", erro: null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SurveyToken",
    entidadeId: tokenId,
    resumo: `${token.colaborador.nome} voltou para a pesquisa.`,
  });

  revalidarNumerosDaPesquisa(empresaId, token.pesquisaId);
  return {
    ok: true,
    message: token.colaborador.ativo
      ? `${token.colaborador.nome} voltou para a lista.`
      : `${token.colaborador.nome} voltou para a lista, mas o cadastro está inativo — reative em Colaboradores para o convite ser enviado.`,
  };
}

/**
 * Apaga de vez o convite de quem está fora da pesquisa — a linha some da lista.
 *
 * Só é seguro apagar porque a exclusão desativa o cadastro: "Gerar convites"
 * só olha para colaboradores ativos, então o convite não volta sozinho na
 * rodada seguinte. Por garantia a ação desativa aqui também — um EXCLUIDO que
 * tenha sobrado ativo (exclusão feita antes desta regra existir, ou cadastro
 * reativado depois) reapareceria no próximo "Gerar convites" se o convite
 * fosse apagado com o cadastro no ar.
 *
 * Só apaga EXCLUIDO. Um convite respondido carrega o registro de que aquela
 * pessoa participou, e a resposta é anônima: apagar o convite não tira a
 * resposta do resultado, só esconde de quem ela veio.
 */
async function apagarExcluidos(
  empresaId: string,
  where: { pesquisaId: string } | { id: string },
): Promise<{ apagados: number; pesquisaId: string | null; nomes: string[] }> {
  const marcaId = await marcaDaEmpresa(empresaId);

  const tokens = await prisma.surveyToken.findMany({
    where: { ...where, status: "EXCLUIDO", pesquisa: { marcaId } },
    select: {
      id: true,
      pesquisaId: true,
      colaboradorId: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (tokens.length === 0) return { apagados: 0, pesquisaId: null, nomes: [] };

  const ids = tokens.map((t) => t.id);
  const colaboradorIds = tokens.map((t) => t.colaboradorId);

  await prisma.$transaction([
    // Desativa por MARCA: agora que o convite alcança os CNPJs irmãos, o
    // excluído pode ser da BRNET numa pesquisa criada na RSM. Preso ao CNPJ,
    // o updateMany não pegaria ninguém e a pessoa voltaria no próximo "Gerar
    // convites" — o retorno que este trecho existe justamente para impedir.
    prisma.colaborador.updateMany({
      where: { id: { in: colaboradorIds }, empresa: { marcaId }, ativo: true },
      data: { ativo: false },
    }),
    prisma.surveyToken.deleteMany({ where: { id: { in: ids } } }),
  ]);

  return {
    apagados: tokens.length,
    pesquisaId: tokens[0].pesquisaId,
    nomes: tokens.map((t) => t.colaborador.nome),
  };
}

/** Apaga o convite de uma pessoa que está fora da pesquisa. */
export async function apagarConviteExcluido(
  empresaId: string,
  tokenId: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const { apagados, pesquisaId, nomes } = await apagarExcluidos(empresaId, { id: tokenId });
  if (apagados === 0) {
    return { ok: false, error: "Só dá para apagar quem está fora da pesquisa." };
  }

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SurveyToken",
    entidadeId: tokenId,
    resumo: `Convite de ${nomes[0]} apagado da pesquisa.`,
  });

  revalidarNumerosDaPesquisa(empresaId, pesquisaId!);
  return { ok: true, message: `${nomes[0]} saiu da lista.` };
}

/** Apaga de uma vez todos os convites que estão fora da pesquisa. */
export async function limparExcluidosDaPesquisa(
  empresaId: string,
  pesquisaId: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const { apagados } = await apagarExcluidos(empresaId, { pesquisaId });
  if (apagados === 0) return { ok: true, message: "Não há ninguém fora da pesquisa." };

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SurveyToken",
    entidadeId: pesquisaId,
    resumo: `${apagados} convite(s) de quem estava fora da pesquisa foram apagados.`,
  });

  revalidarNumerosDaPesquisa(empresaId, pesquisaId);
  return { ok: true, message: `${apagados} pessoa(s) apagada(s) da lista.` };
}

/**
 * Limpa um vínculo de Telegram morto: apaga o chat_id do COLABORADOR (não só
 * deste convite) e volta o token para PENDING com um motivo que dá para agir.
 *
 * É a Colaborador que a coluna some, não o SurveyToken — o chat_id ruim
 * pertence à ficha e atrapalharia qualquer outra pesquisa também. Volta a
 * PENDING, não fica FAILED: FAILED nunca é retentado pelo envio automático
 * (ver lib/convites.ts), e é exatamente o /start seguinte que vai gravar um
 * chat_id válido por cima — precisa que o envio tente de novo sozinho quando
 * isso acontecer.
 */
async function limparVinculo(
  empresaId: string,
  where: { pesquisaId: string } | { id: string },
): Promise<{ limpos: number; pesquisaId: string | null; nomes: string[] }> {
  const marcaId = await marcaDaEmpresa(empresaId);

  const tokens = await prisma.surveyToken.findMany({
    where: { ...where, pesquisa: { marcaId } },
    select: {
      id: true,
      pesquisaId: true,
      status: true,
      canal: true,
      erro: true,
      colaboradorId: true,
      colaborador: { select: { nome: true } },
    },
  });
  const quebrados = tokens.filter(vinculoTelegramQuebrado);
  if (quebrados.length === 0) return { limpos: 0, pesquisaId: null, nomes: [] };

  const tokenIds = quebrados.map((t) => t.id);
  const colaboradorIds = [...new Set(quebrados.map((t) => t.colaboradorId))];

  await prisma.$transaction([
    // Por MARCA, pelo mesmo motivo de apagarExcluidos: o chat_id quebrado pode
    // ser de alguém de um CNPJ irmão. Preso ao CNPJ, o botão diria "limpo" e
    // o vínculo continuaria lá, com a pessoa parada em FAILED para sempre.
    prisma.colaborador.updateMany({
      where: { id: { in: colaboradorIds }, empresa: { marcaId } },
      data: { telegramChatId: null },
    }),
    prisma.surveyToken.updateMany({
      where: { id: { in: tokenIds } },
      data: { status: "PENDING", canal: "TELEGRAM", erro: MSG_AGUARDANDO_NOVO_VINCULO },
    }),
  ]);

  return {
    limpos: quebrados.length,
    pesquisaId: quebrados[0].pesquisaId,
    nomes: quebrados.map((t) => t.colaborador.nome),
  };
}

/** Limpa o vínculo quebrado de uma pessoa (chat_id morto no Telegram). */
export async function limparVinculoQuebrado(
  empresaId: string,
  tokenId: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const { limpos, pesquisaId, nomes } = await limparVinculo(empresaId, { id: tokenId });
  if (limpos === 0) {
    return { ok: false, error: "Este convite não está com vínculo quebrado." };
  }

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: tokenId,
    resumo: `Vínculo do Telegram de ${nomes[0]} foi limpo (chat_id morto).`,
  });

  revalidarNumerosDaPesquisa(empresaId, pesquisaId!);
  return { ok: true, message: `Vínculo de ${nomes[0]} limpo — peça para a pessoa mandar /start de novo.` };
}

/** Limpa de uma vez todos os vínculos quebrados desta pesquisa. */
export async function limparVinculosQuebradosDaPesquisa(
  empresaId: string,
  pesquisaId: string,
): Promise<ResultadoComMensagem> {
  await requireEmpresaAccess(empresaId);

  const { limpos } = await limparVinculo(empresaId, { pesquisaId });
  if (limpos === 0) return { ok: true, message: "Não há vínculo quebrado nesta pesquisa." };

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: pesquisaId,
    resumo: `${limpos} vínculo(s) de Telegram quebrado(s) foram limpos.`,
  });

  revalidarNumerosDaPesquisa(empresaId, pesquisaId);
  return { ok: true, message: `${limpos} vínculo(s) limpo(s).` };
}

export async function enviarConviteToken(empresaId: string, tokenId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const token = await prisma.surveyToken.findFirst({
    where: { id: tokenId, pesquisa: { empresaId } },
    include: { colaborador: true, pesquisa: true },
  });
  if (!token) return { ok: false, error: "Convite não encontrado." };
  // O botão nem aparece nesses dois casos; a checagem é aqui porque enviar um
  // convite é o que o excluído não pode receber de jeito nenhum.
  if (token.status === "EXCLUIDO") {
    return { ok: false, error: "Esta pessoa está fora da pesquisa." };
  }
  if (!token.colaborador.ativo) {
    return { ok: false, error: "Cadastro inativo — reative em Colaboradores para enviar o convite." };
  }

  const resultado = await enviarUmConvite(token);
  revalidatePath(`/rh/${empresaId}/pesquisas/${token.pesquisaId}`);
  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
}

export type EnvioLoteResult = {
  ok: boolean;
  enviados: number;
  falhas: number;
  restantes: number;
  error?: string;
};

// Envia UM LOTE de convites pendentes/falhos e devolve quantos restam — o
// cliente chama em loop até restantes = 0. Lotes pequenos porque uma server
// action tem tempo de execução limitado na Vercel; enviar 200+ numa chamada
// única estouraria o limite e deixaria envios pela metade sem retorno.
export async function enviarConvites(
  empresaId: string,
  pesquisaId: string,
  limite = 15,
): Promise<EnvioLoteResult> {
  await requireEmpresaAccess(empresaId);

  // Teto GLOBAL de envios por dia (Brasília) — compartilhado com o envio
  // automático diário. Atingido o teto, o restante sai nos próximos dias.
  const orcamento = await enviosRestantesHoje();
  // Só quem está ativo. Um convite pendente de cadastro desativado (tirado da
  // pesquisa por não ser funcionário, ou desligado depois da geração) não pode
  // consumir orçamento de envio nem contar como "restante" — o loop do cliente
  // chama esta action até restantes = 0 e ficaria rodando à toa.
  const restantesQuery = {
    pesquisaId,
    pesquisa: { empresaId },
    status: { in: ["PENDING", "FAILED"] },
    colaborador: { ativo: true },
  };
  if (orcamento <= 0) {
    const restantes = await prisma.surveyToken.count({ where: restantesQuery });
    return {
      ok: false,
      enviados: 0,
      falhas: 0,
      restantes,
      error: `Limite diário de ${LIMITE_DIARIO_ENVIOS} envios atingido — o envio automático continua amanhã.`,
    };
  }

  const lote = await prisma.surveyToken.findMany({
    where: restantesQuery,
    include: { colaborador: true, pesquisa: true },
    // PENDING antes de FAILED: um convite com falha permanente (ex.: sem canal)
    // não pode monopolizar os lotes e impedir os pendentes de sair.
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(limite, 1), 30, orcamento),
  });

  let enviados = 0;
  let falhas = 0;
  let ultimoErro: string | undefined;
  for (const token of lote) {
    const resultado = await enviarUmConvite(token);
    if (resultado.ok) enviados++;
    else {
      falhas++;
      ultimoErro = resultado.error;
    }
  }

  const restantes = await prisma.surveyToken.count({ where: restantesQuery });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: falhas === 0, enviados, falhas, restantes, error: ultimoErro };
}

export type ResumoGestaoCiclo = {
  criados: number;
  encerrados: number;
  erros: string[];
};

/**
 * O mesmo motor do cron diário (app/api/cron/gestao-ciclo-pesquisas), botão
 * na mão do RH em vez de request com CRON_SECRET. Existe para o caso que o
 * cron não cobre: a janela automática do Pulso trimestral é só nos meses
 * 1/4/7/10 (ver `precisaCriarCiclo` em lib/pesquisa-ciclo.ts) — uma marca sem
 * CNPJ ativo na janela, ou criada fora dela, fica sem Pulso até o próximo
 * trimestre a menos que alguém rode isto manualmente.
 *
 * Guard é `requireRHAccess`, não `requireEmpresaAccess`: a ação não é de uma
 * empresa, é do grupo inteiro — mesmo critério de lib/actions/rh-estrutura.ts
 * para configuração de marcas e CNPJs.
 */
export async function executarGestaoCicloAgora(): Promise<
  { ok: true; resumo: ResumoGestaoCiclo } | { ok: false; error: string }
> {
  await requireRHAccess();

  const resultado = await executarGestaoCiclo();

  await registrarAuditoria({
    acao: "CRIAR",
    entidade: "Pesquisa",
    resumo:
      `Gestão de ciclo executada manualmente: ${resultado.criados.length} pesquisa(s) criada(s), ` +
      `${resultado.encerrados.length} encerrada(s), ${resultado.erros.length} erro(s)`,
    detalhes: {
      criados: resultado.criados.map((c) => ({ empresaId: c.empresaId, titulo: c.titulo, tipo: c.tipo })),
      encerrados: resultado.encerrados.map((e) => ({ titulo: e.titulo, motivo: e.motivo })),
      erros: resultado.erros,
    },
  });

  revalidatePath("/", "layout");

  if (resultado.erros.length > 0 && resultado.criados.length === 0 && resultado.encerrados.length === 0) {
    return { ok: false, error: resultado.erros[0] };
  }

  return {
    ok: true,
    resumo: { criados: resultado.criados.length, encerrados: resultado.encerrados.length, erros: resultado.erros },
  };
}
