"use server";

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { CHAVE_ANTHROPIC, segredo } from "@/lib/segredos";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import {
  ESQUEMA_DEMANDA,
  montarSistema,
  normalizarProposta,
  type Proposta,
  type PropostaBruta,
} from "@/lib/delegacoes/redator";

// A porta da IA do módulo Delegações: recebe "quem" + "o contexto" e devolve a
// demanda inteira montada, PRONTA PARA CONFERIR — não gravada.
//
// Não grava de propósito. Uma demanda enviada dispara o relógio do aceite
// contra uma pessoa de verdade; o combinado (prazo e critério de aceite) é o
// que vai ser cobrado dela depois. Quem responde por esse combinado é quem
// delegou, então ele passa pelos olhos de quem delega antes de existir — um
// clique, com os campos à vista e editáveis. É a diferença entre a IA fazer o
// TRABALHO e a IA assumir o COMPROMISSO no lugar de alguém.
//
// Mesmo molde do assistente de RH (lib/actions/rh-assistente.ts): chave vinda
// cifrada do banco, modelo `claude-sonnet-5`, teto de tokens, e recusa tratada.

const MODELO = "claude-sonnet-5";
// Uma chamada, um objeto. Não há ida e volta de ferramenta aqui — o teto só
// precisa caber o raciocínio do Sonnet 5 mais o JSON da demanda.
const MAX_TOKENS = 3000;
// O contexto é ditado, não redigido. Acima disto não é mais um pedido: é um
// documento, e o corte protege o custo e o tempo de resposta da tela.
const LIMITE_CONTEXTO = 4000;

export type ResultadoRedacao =
  | { ok: true; proposta: Proposta }
  | { ok: false; erro: string };

/**
 * Monta a demanda a partir do contexto livre. Não grava nada.
 *
 * O responsável entra só como NOME no prompt (para o texto sair na pessoa
 * certa); a validação de que ele pode receber demanda continua sendo da
 * `criarDemanda`, na hora de gravar.
 */
export async function rascunharComIA(input: {
  responsavelId: string;
  contexto: string;
}): Promise<ResultadoRedacao> {
  await requireDelegacoesAccess();

  const contexto = input.contexto.trim().slice(0, LIMITE_CONTEXTO);
  if (contexto.length < 10) {
    return { ok: false, erro: "Escreva um pouco mais sobre o que você precisa — com uma frase só a IA não tem o que organizar." };
  }

  const chave = await segredo(CHAVE_ANTHROPIC);
  if (!chave) {
    return {
      ok: false,
      erro: "A IA está desligada: falta cadastrar a chave da Anthropic em Configuração → Canais de envio. Enquanto isso, dá para delegar preenchendo os campos à mão.",
    };
  }

  const responsavel = await prisma.user.findUnique({
    where: { id: input.responsavelId },
    select: { id: true, nome: true, ativo: true, role: true },
  });
  if (!responsavel || !responsavel.ativo) {
    return { ok: false, erro: "Escolha primeiro para quem é a demanda." };
  }
  // Mesma recusa da criação, feita ANTES de gastar token: não faz sentido a IA
  // redigir uma demanda para quem não consegue entrar no módulo.
  if (!(await sistemasPermitidos(responsavel)).includes("delegacoes")) {
    return {
      ok: false,
      erro: `${responsavel.nome} ainda não tem acesso ao módulo Delegações — libere em Usuários e perfis antes de delegar.`,
    };
  }

  const marcas = await prisma.marca.findMany({
    where: { ativo: true },
    select: { nome: true },
    orderBy: { nome: "asc" },
  });

  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
  }).format(new Date());

  const anthropic = new Anthropic({ apiKey: chave });

  try {
    const resposta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "medium" },
      system: montarSistema({
        hoje,
        responsavelNome: responsavel.nome,
        marcas: marcas.map((m) => m.nome),
      }),
      // `tool_choice` obrigatório: o modelo não tem a opção de "conversar".
      // Ou ele preenche o formulário, ou a chamada falha — e falhar é melhor
      // que devolver prosa que a tela teria que adivinhar como interpretar.
      tools: [
        {
          name: "montar_demanda",
          description: "Monta a demanda a partir do contexto informal do solicitante.",
          input_schema: ESQUEMA_DEMANDA,
        },
      ],
      tool_choice: { type: "tool", name: "montar_demanda" },
      messages: [{ role: "user", content: contexto }],
    });

    if (resposta.stop_reason === "refusal") {
      return {
        ok: false,
        erro: "O modelo recusou montar essa demanda. Reescreva o contexto focando no que precisa ser feito.",
      };
    }

    const chamada = resposta.content.find((c) => c.type === "tool_use");
    if (!chamada || chamada.type !== "tool_use") {
      return {
        ok: false,
        erro: "A IA não devolveu a demanda no formato esperado. Tente de novo; se repetir, preencha à mão.",
      };
    }

    // `normalizarProposta` já devolve exatamente o contrato desta action:
    // ou a proposta normalizada, ou o motivo em português de por que o que
    // voltou não serve.
    return normalizarProposta(chamada.input as PropostaBruta, {
      hoje: new Date(),
      marcas: marcas.map((m) => m.nome),
    });
  } catch (e) {
    console.error("[delegacoes-ia] falha ao montar a demanda:", e);
    return {
      ok: false,
      erro: "Não consegui falar com a IA agora. Tente de novo em instantes, ou preencha os campos à mão.",
    };
  }
}
