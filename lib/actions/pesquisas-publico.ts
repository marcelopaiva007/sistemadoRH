"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { definicaoPesquisa } from "@/lib/pesquisas-catalogo";
import type { ActionResult } from "@/lib/constants";
import { ipDaRequisicao } from "@/lib/login-tentativas";
import { envioPublicoBarrado, LIMITE_RESPOSTA_PESQUISA, MENSAGEM_LIMITE_PUBLICO } from "@/lib/limite-publico";
import { validarItensEnvio } from "@/lib/pesquisa-envio-validacao";

const respostaItemSchema = z.object({
  perguntaId: z.string(),
  valorNumerico: z.coerce.number().int().optional(),
  valorTexto: z.string().trim().optional(),
  opcaoId: z.string().optional(),
});

// Só o formato. O conteúdo (pergunta é desta pesquisa? opção é desta
// pergunta? nota dentro da escala? repetida?) é conferido contra o banco em
// validarItensEnvio (lib/pesquisa-envio-validacao.ts) — 26/11/2026. O teto de
// itens corta payload absurdo antes de qualquer laço.
const respostaSchema = z.object({
  itens: z.array(respostaItemSchema).max(500),
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
  // Limite por IP (25/11/2026): 30 envios por hora (lib/limite-publico.ts).
  // Vem ANTES da busca do token — a busca é justamente o que um robô
  // chutando tokens exploraria. Falha aberta se a contagem der erro.
  if (await envioPublicoBarrado(LIMITE_RESPOSTA_PESQUISA, ipDaRequisicao(await headers()))) {
    return { ok: false, error: MENSAGEM_LIMITE_PUBLICO };
  }

  const surveyToken = await prisma.surveyToken.findUnique({
    where: { token },
    include: {
      pesquisa: {
        include: {
          perguntas: { select: { id: true, tipo: true, obrigatoria: true, ordem: true, enunciado: true, opcoes: { select: { id: true } } } },
        },
      },
      colaborador: true,
    },
  });
  if (!surveyToken) return { ok: false, error: "Convite não encontrado." };
  if (surveyToken.pesquisa.status !== "ACTIVE") {
    return { ok: false, error: "Esta pesquisa não está mais aceitando respostas." };
  }
  if (surveyToken.status === "RESPONDED") {
    return { ok: false, error: "Este convite já foi respondido." };
  }
  // Quem o RH tirou da pesquisa já pode ter o link no celular — a exclusão só
  // vale se ela for verificada aqui também, não apenas na hora de enviar.
  if (surveyToken.status === "EXCLUIDO") {
    return { ok: false, error: "Este convite não está mais válido." };
  }
  // RD-001: o convite pode ter sido enviado antes do desligamento — revalida
  // o vínculo na hora de responder, não só na hora de enviar. Exceto pra
  // tipos cujo catálogo aceita "desligado" (P09-OFF é literalmente pra quem
  // já saiu) — aí o bloqueio faria a própria pesquisa nunca ser respondida.
  const aceitaDesligado = definicaoPesquisa(surveyToken.pesquisa.modelo).elegibilidadeVinculo.includes("desligado");
  if (!surveyToken.colaborador.ativo && !aceitaDesligado) {
    return { ok: false, error: "Este convite não está mais válido." };
  }

  let itensRaw: unknown;
  try {
    itensRaw = JSON.parse(String(formData.get("itensJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Respostas inválidas." };
  }
  const parsed = respostaSchema.safeParse({ itens: itensRaw });
  if (!parsed.success) return { ok: false, error: "Respostas inválidas." };

  // Cada item conferido contra as perguntas DESTA pesquisa (26/11/2026) —
  // inclui a checagem de obrigatórias, agora feita sobre os itens já limpos.
  const validacao = validarItensEnvio(surveyToken.pesquisa.perguntas, parsed.data.itens);
  if (!validacao.ok) return { ok: false, error: validacao.error };

  // Sentinela para abortar a transação quando outro envio chegou primeiro.
  const JA_RESPONDIDO = "JA_RESPONDIDO";
  try {
    await prisma.$transaction(async (tx) => {
      // Marcar o token é a PRIMEIRA operação, e condicionada ao status atual:
      // é o Postgres que serializa dois envios simultâneos (mesmo link aberto
      // no celular e no computador). A checagem lá em cima, fora da transação,
      // só existe para a mensagem amigável no caso comum — sem este
      // compare-and-set o segundo envio criaria uma Resposta duplicada, e em
      // pesquisa anônima a duplicata seria indetectável depois, entrando
      // silenciosamente na média do setor.
      const marcado = await tx.surveyToken.updateMany({
        where: { id: surveyToken.id, status: { not: "RESPONDED" } },
        data: { status: "RESPONDED", respondidoEm: new Date() },
      });
      if (marcado.count === 0) throw new Error(JA_RESPONDIDO);

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

      // Uma ida ao banco para todos os itens (26/11/2026), dentro da mesma
      // transação: ou a resposta entra inteira, ou nada entra.
      if (validacao.itens.length > 0) {
        await tx.respostaItem.createMany({
          data: validacao.itens.map((item) => ({ respostaId: resposta.id, ...item })),
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === JA_RESPONDIDO) {
      return { ok: false, error: "Este convite já foi respondido." };
    }
    throw e;
  }

  return { ok: true };
}
