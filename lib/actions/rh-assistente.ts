"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { FERRAMENTAS, contextoTemporal, executarFerramenta } from "@/lib/assistente/ferramentas";
import { CHAVE_ANTHROPIC, segredo } from "@/lib/segredos";

const MODELO = "claude-sonnet-5";
// Teto de idas e voltas com o modelo. Sem isso, uma pergunta ambígua pode
// virar um laço de chamadas de ferramenta e queimar crédito à toa.
const MAX_RODADAS = 6;
// No Sonnet 5 o raciocínio vem ligado por padrão e é cobrado dentro do mesmo
// teto da resposta. Com 1500 uma pergunta que exige pensar um pouco gastava o
// orçamento raciocinando e devolvia texto cortado no meio.
const MAX_TOKENS = 8000;

export type RespostaAssistente =
  | { ok: true; resposta: string; ferramentasUsadas: string[] }
  | { ok: false; erro: string };

export async function assistenteDesligado(): Promise<boolean> {
  return !(await segredo(CHAVE_ANTHROPIC));
}

export async function perguntarAoAssistente(
  empresaId: string,
  pergunta: string,
): Promise<RespostaAssistente> {
  await requireEmpresaAccess(empresaId);

  // Ambiente ou banco — quem decide a precedência é lib/segredos.ts.
  const chave = await segredo(CHAVE_ANTHROPIC);
  if (!chave) {
    return {
      ok: false,
      erro: "O assistente está desligado: falta cadastrar a chave da API da Anthropic. Um administrador cadastra aqui mesmo, nesta tela.",
    };
  }

  const texto = pergunta.trim();
  if (texto.length < 3) return { ok: false, erro: "Escreva a pergunta." };
  if (texto.length > 1000) return { ok: false, erro: "Pergunta muito longa (máximo 1000 caracteres)." };

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } });

  const anthropic = new Anthropic({ apiKey: chave });

  const sistema = [
    `Você é o assistente de RH da empresa ${empresa?.nome ?? ""}, dentro do sistema de RH do grupo.`,
    contextoTemporal(),
    "",
    "Regras:",
    "- Responda SOMENTE com base no que as ferramentas devolverem. Nunca invente número, nome ou data.",
    "- Se as ferramentas não tiverem a informação, diga que o sistema não tem esse dado — não estime.",
    "- Você só enxerga esta empresa. Não há como consultar outra.",
    "- Responda em português do Brasil, direto, sem rodeio. Número em tabela quando forem vários itens.",
    "- Se a resposta vier vazia, diga que não há registro — isso costuma significar que a base ainda não foi alimentada, não que o dado é zero por natureza.",
  ].join("\n");

  const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: texto }];
  const ferramentasUsadas: string[] = [];

  try {
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resposta = await anthropic.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        // Explícito de propósito. O assistente vive de escolher ferramenta, e
        // com o raciocínio desligado o Sonnet 5 chama ferramenta bem menos —
        // responderia de cabeça justamente onde não pode inventar nada.
        thinking: { type: "adaptive" },
        // As perguntas são de consulta e as ferramentas já entregam o dado
        // pronto; o padrão do modelo (high) só custaria tempo e token aqui.
        output_config: { effort: "medium" },
        system: sistema,
        tools: FERRAMENTAS,
        messages: mensagens,
      });

      // Os classificadores do Sonnet 5 podem recusar a pergunta. Vem HTTP 200
      // com conteúdo vazio — sem esta checagem viraria o "não consegui montar
      // uma resposta" genérico lá embaixo, e ninguém saberia o motivo.
      if (resposta.stop_reason === "refusal") {
        return {
          ok: false,
          erro: "O modelo recusou responder a essa pergunta. Reescreva focando no dado de RH que você precisa.",
        };
      }

      const chamadas = resposta.content.filter((c) => c.type === "tool_use");

      if (chamadas.length === 0) {
        const final = resposta.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n")
          .trim();

        await registrarAuditoria({
          empresaId,
          acao: "ATUALIZAR",
          entidade: "AssistenteRH",
          // A pergunta entra na trilha, a resposta não: ela pode conter dado
          // pessoal de várias pessoas de uma vez. Fica registrado QUEM
          // perguntou O QUÊ — que é o que importa para auditar acesso.
          resumo: `Pergunta ao assistente: "${texto.slice(0, 200)}"${ferramentasUsadas.length ? ` (consultou: ${[...new Set(ferramentasUsadas)].join(", ")})` : ""}.`,
        });

        return {
          ok: true,
          // Resposta cortada no teto sai avisada. Sem o aviso, uma tabela que
          // parou na metade parece a lista inteira — e quem lê age em cima de
          // um dado incompleto sem desconfiar.
          resposta:
            (final || "Não consegui montar uma resposta para essa pergunta.") +
            (resposta.stop_reason === "max_tokens"
              ? "\n\n_(resposta interrompida por tamanho — peça um recorte menor, por setor ou por período)_"
              : ""),
          ferramentasUsadas: [...new Set(ferramentasUsadas)],
        };
      }

      mensagens.push({ role: "assistant", content: resposta.content });

      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const chamada of chamadas) {
        ferramentasUsadas.push(chamada.name);
        const saida = await executarFerramenta(
          empresaId,
          chamada.name,
          (chamada.input ?? {}) as Record<string, unknown>,
        );
        resultados.push({
          type: "tool_result",
          tool_use_id: chamada.id,
          content: JSON.stringify(saida),
        });
      }
      mensagens.push({ role: "user", content: resultados });
    }

    return {
      ok: false,
      erro: "A pergunta ficou dando voltas sem chegar a uma resposta. Tente ser mais específico.",
    };
  } catch (e) {
    // Não vazar detalhe de erro da API para a tela — mas registrar no servidor.
    console.error("[assistente] falha ao consultar o modelo:", e);
    const status = (e as { status?: number })?.status;
    if (status === 401) return { ok: false, erro: "A chave da API foi recusada. Confira ANTHROPIC_API_KEY." };
    if (status === 429) return { ok: false, erro: "Muitas perguntas em sequência. Espere um instante e tente de novo." };
    return { ok: false, erro: "Não consegui falar com o assistente agora. Tente de novo em instantes." };
  }
}
