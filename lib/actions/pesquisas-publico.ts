"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/constants";

const respostaItemSchema = z.object({
  perguntaId: z.string(),
  valorNumerico: z.coerce.number().int().optional(),
  valorTexto: z.string().trim().optional(),
  opcaoId: z.string().optional(),
});

const respostaSchema = z.object({
  itens: z.array(respostaItemSchema),
});

function faixaEtaria(nascimento: Date | null): string | null {
  if (!nascimento) return null;
  const idade = Math.floor((Date.now() - nascimento.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (idade < 18 || idade > 100) return null;
  if (idade < 25) return "18-24";
  if (idade < 35) return "25-34";
  if (idade < 45) return "35-44";
  if (idade < 55) return "45-54";
  return "55+";
}

// Única server action do módulo de RH sem requireUser/requireAdmin — a
// autorização é o próprio token (imprevisível, gerado com crypto.randomBytes).
// Roda a partir de uma página pública, sem sessão.
export async function responderPesquisa(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const surveyToken = await prisma.surveyToken.findUnique({
    where: { token },
    include: { pesquisa: { include: { perguntas: true } }, colaborador: true },
  });
  if (!surveyToken) return { ok: false, error: "Convite não encontrado." };
  if (surveyToken.pesquisa.status !== "ACTIVE") {
    return { ok: false, error: "Esta pesquisa não está mais aceitando respostas." };
  }
  if (surveyToken.status === "RESPONDED") {
    return { ok: false, error: "Este convite já foi respondido." };
  }

  let itensRaw: unknown;
  try {
    itensRaw = JSON.parse(String(formData.get("itensJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Respostas inválidas." };
  }
  const parsed = respostaSchema.safeParse({ itens: itensRaw });
  if (!parsed.success) return { ok: false, error: "Respostas inválidas." };

  const perguntasObrigatorias = surveyToken.pesquisa.perguntas.filter((p) => p.obrigatoria);
  const perguntasRespondidas = new Set(parsed.data.itens.map((i) => i.perguntaId));
  const faltando = perguntasObrigatorias.some((p) => !perguntasRespondidas.has(p.id));
  if (faltando) return { ok: false, error: "Responda todas as perguntas obrigatórias." };

  await prisma.$transaction(async (tx) => {
    const resposta = await tx.resposta.create({
      data: {
        pesquisaId: surveyToken.pesquisaId,
        colaboradorId: surveyToken.pesquisa.anonima ? null : surveyToken.colaboradorId,
        setorNomeSnapshot: "",
        posicaoNomeSnapshot: "",
      },
    });

    // Snapshot de setor/posição no momento da resposta (sempre gravado, mesmo
    // em pesquisa anônima) — é isso que permite o RH filtrar agregados por
    // setor/posição sem jamais identificar quem respondeu. Sexo e FAIXA etária
    // (nunca idade exata — setor pequeno + idade identificaria) seguem a mesma
    // lógica, para os recortes demográficos da avaliação NR-01.
    const colaborador = await tx.colaborador.findUnique({
      where: { id: surveyToken.colaboradorId },
      include: { setor: true, posicao: true },
    });
    await tx.resposta.update({
      where: { id: resposta.id },
      data: {
        setorNomeSnapshot: colaborador?.setor.nome ?? "Desconhecido",
        posicaoNomeSnapshot: colaborador?.posicao.nome ?? "Desconhecido",
        sexoSnapshot: colaborador?.sexo ?? null,
        faixaEtariaSnapshot: faixaEtaria(colaborador?.dataNascimento ?? null),
      },
    });

    for (const item of parsed.data.itens) {
      await tx.respostaItem.create({
        data: {
          respostaId: resposta.id,
          perguntaId: item.perguntaId,
          valorNumerico: item.valorNumerico ?? null,
          valorTexto: item.valorTexto || null,
          opcaoId: item.opcaoId || null,
        },
      });
    }

    await tx.surveyToken.update({
      where: { id: surveyToken.id },
      data: { status: "RESPONDED", respondidoEm: new Date() },
    });
  });

  return { ok: true };
}
