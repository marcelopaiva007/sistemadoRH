"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { enviarUmConvite, enviosRestantesHoje, LIMITE_DIARIO_ENVIOS } from "@/lib/convites";
import {
  PERGUNTAS_NR01,
  TITULO_PESQUISA_NR01,
  DESCRICAO_PESQUISA_NR01,
} from "@/lib/nr01-modelo";
import type { ActionResult } from "@/lib/constants";

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

export async function updatePesquisa(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = pesquisaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    anonima: formData.get("anonima") === "on" || formData.get("anonima") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.pesquisa.update({
    where: { id, empresaId },
    data: {
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
      anonima: parsed.data.anonima,
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
// mais simples que reconciliar diffs linha a linha (mesmo espírito do
// tratamento do config JSON de RegraBonificacao).
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

export async function gerarConvites(empresaId: string, pesquisaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id: pesquisaId, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, ativo: true },
    select: { id: true },
  });

  await prisma.surveyToken.createMany({
    data: colaboradores.map((c) => ({
      pesquisaId,
      colaboradorId: c.id,
      token: crypto.randomBytes(24).toString("base64url"),
    })),
    skipDuplicates: true,
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: true };
}

export async function enviarConviteToken(empresaId: string, tokenId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const token = await prisma.surveyToken.findFirst({
    where: { id: tokenId, pesquisa: { empresaId } },
    include: { colaborador: true, pesquisa: true },
  });
  if (!token) return { ok: false, error: "Convite não encontrado." };

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
  const restantesQuery = {
    pesquisaId,
    pesquisa: { empresaId },
    status: { in: ["PENDING", "FAILED"] },
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

  const restantes = await prisma.surveyToken.count({
    where: { pesquisaId, pesquisa: { empresaId }, status: { in: ["PENDING", "FAILED"] } },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: falhas === 0, enviados, falhas, restantes, error: ultimoErro };
}
