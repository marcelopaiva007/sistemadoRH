"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { cifrar, dicaDe } from "@/lib/cripto";
import { CHAVE_ANTHROPIC } from "@/lib/segredos";
import type { ActionResult } from "@/lib/constants";

/**
 * Cadastro da chave da Anthropic pela tela.
 *
 * Só ADMIN, e por um motivo concreto: quem grava a chave passa a poder gastar
 * na conta da Anthropic do grupo. Guarda própria em vez de `requireAdmin` para
 * a tela receber a recusa como mensagem, em vez de um redirect silencioso no
 * meio de um formulário.
 *
 * A chave entra, nunca sai: nenhuma action deste arquivo devolve o valor, e o
 * banco guarda a versão cifrada (lib/cripto.ts).
 */
async function exigirAdmin(): Promise<{ ok: true; user: { id: string; nome?: string | null } } | { ok: false; error: string }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { ok: false, error: "Só um administrador pode alterar a chave da API." };
  }
  return { ok: true, user };
}

export async function salvarChaveAnthropic(empresaId: string, chave: string): Promise<ActionResult> {
  const permissao = await exigirAdmin();
  if (!permissao.ok) return permissao;

  // Colar de um e-mail ou do console traz espaço e quebra de linha junto, e o
  // erro apareceria só na primeira pergunta, como "chave recusada".
  const valor = chave.trim();
  if (!valor) return { ok: false, error: "Cole a chave." };
  if (/\s/.test(valor)) return { ok: false, error: "A chave não pode conter espaços — verifique o que foi colado." };

  // Vale mais testar contra a API do que conferir o formato: o formato da
  // chave é da Anthropic e pode mudar, e uma chave revogada passa em qualquer
  // validação de prefixo. Esta chamada é de listagem, não consome tokens.
  try {
    await new Anthropic({ apiKey: valor }).models.list({ limit: 1 });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return { ok: false, error: "A Anthropic recusou essa chave. Confira se copiou inteira e se ela ainda está ativa." };
    }
    console.error("[segredos] falha ao validar a chave da Anthropic:", e);
    return { ok: false, error: "Não consegui falar com a Anthropic para conferir a chave. Tente de novo em instantes." };
  }

  const dica = dicaDe(valor);
  await prisma.segredoApp.upsert({
    where: { chave: CHAVE_ANTHROPIC },
    create: {
      chave: CHAVE_ANTHROPIC,
      valor: cifrar(valor),
      dica,
      atualizadoPor: permissao.user.nome ?? permissao.user.id,
    },
    update: {
      valor: cifrar(valor),
      dica,
      atualizadoPor: permissao.user.nome ?? permissao.user.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_ANTHROPIC,
    // A dica entra na trilha, a chave não. Serve para reconhecer QUAL chave
    // passou a valer sem que a trilha vire um lugar onde se lê credencial.
    resumo: `Chave da API da Anthropic cadastrada (final ${dica}). O assistente de RH passou a funcionar.`,
  });

  revalidatePath(`/rh/${empresaId}/assistente`);
  return { ok: true };
}

export async function removerChaveAnthropic(empresaId: string): Promise<ActionResult> {
  const permissao = await exigirAdmin();
  if (!permissao.ok) return permissao;

  const existente = await prisma.segredoApp.findUnique({
    where: { chave: CHAVE_ANTHROPIC },
    select: { dica: true },
  });
  if (!existente) return { ok: false, error: "Não há chave cadastrada para remover." };

  await prisma.segredoApp.delete({ where: { chave: CHAVE_ANTHROPIC } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_ANTHROPIC,
    resumo: `Chave da API da Anthropic removida (final ${existente.dica}). O assistente de RH voltou a ficar desligado.`,
  });

  revalidatePath(`/rh/${empresaId}/assistente`);
  return { ok: true };
}
