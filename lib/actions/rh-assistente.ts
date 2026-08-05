"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import {
  FERRAMENTAS,
  contextoTemporal,
  executarFerramenta,
  montarEscopo,
} from "@/lib/assistente/ferramentas";
import { CHAVE_ANTHROPIC, segredo } from "@/lib/segredos";

const MODELO = "claude-sonnet-5";
// Teto de idas e voltas com o modelo. Sem isso, uma pergunta ambígua pode
// virar um laço de chamadas de ferramenta e queimar crédito à toa.
//
// Subiu de 6 para 10 quando entraram as ferramentas de número: "compare
// Comercial e Área Técnica nos últimos 6 meses" gasta 4 rodadas só para
// levantar o dado, e a comparação de dois recortes com uma ressalva de
// cadastro no meio passava do teto e devolvia "a pergunta ficou dando voltas"
// — a mensagem de desistência aparecendo justo nas perguntas boas.
const MAX_RODADAS = 10;
// No Sonnet 5 o raciocínio vem ligado por padrão e é cobrado dentro do mesmo
// teto da resposta. Com 1500 uma pergunta que exige pensar um pouco gastava o
// orçamento raciocinando e devolvia texto cortado no meio.
const MAX_TOKENS = 8000;

export type RespostaAssistente =
  { ok: true; resposta: string; ferramentasUsadas: string[] } | { ok: false; erro: string };

export async function assistenteDesligado(): Promise<boolean> {
  return !(await segredo(CHAVE_ANTHROPIC));
}

export async function perguntarAoAssistente(
  empresaId: string,
  pergunta: string
): Promise<RespostaAssistente> {
  const usuario = await requireEmpresaAccess(empresaId);

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
  if (texto.length > 1000)
    return { ok: false, erro: "Pergunta muito longa (máximo 1000 caracteres)." };

  // O escopo é montado no SERVIDOR e o modelo nunca escolhe nem enxerga como
  // foi derivado: ele recebe a frase pronta e as ferramentas já vêm presas a
  // essa lista de CNPJs. É a mesma garantia do `empresaId` fixo de antes, só
  // que agora no recorte certo — o da marca, igual a Painel e Indicadores.
  const escopo = await montarEscopo(empresaId, await empresasVisiveis(usuario));

  const anthropic = new Anthropic({ apiKey: chave });

  const sistema = [
    `Você é o assistente de RH do grupo, dentro do sistema de RH.`,
    contextoTemporal(),
    "",
    `Escopo dos dados que você enxerga: ${escopo.descricao}`,
    "",
    "Regras:",
    "- Responda SOMENTE com base no que as ferramentas devolverem. Nunca invente número, nome ou data.",
    "- Se as ferramentas não tiverem a informação, diga que o sistema não tem esse dado — não estime.",
    "- Todo número que você devolve cobre TODOS os CNPJs do escopo acima, não só o da tela em que a pessoa está. Quando o número puder ser confundido com o de um CNPJ só, diga qual é o recorte.",
    "- Fora desse escopo você não alcança nada. Perguntaram sobre outra marca ou outro CNPJ: diga que está fora do seu acesso, não tente responder por aproximação.",
    "- Responda em português do Brasil, direto, sem rodeio. Número em tabela quando forem vários itens.",
    "",
    "Honestidade de dado (não negociável):",
    "- Quando uma ferramenta devolver `avisos`, `aviso` ou `semRegistroNenhum`, repita o conteúdo junto do número correspondente. Esses campos existem porque o número, sozinho, mente. Omitir é pior em prosa do que numa tabela: soa como conclusão sua.",
    "- Zero vindo de tabela vazia NÃO é bom desempenho. Se a ferramenta disser que não há registro, escreva 'não há medição' ou 'o módulo não foi alimentado' — nunca 'está baixo', 'está zerado', 'está tudo em dia' ou 'parabéns'.",
    "- Campo com valor `null` significa 'sem dado', não zero. Não escreva R$ 0 nem 0% no lugar de null, e não compare uma linha sem dado com as demais como se fosse a mais barata ou a melhor.",
    "- Sempre diga o que ficou de fora do recorte quando a ferramenta informar (registros sem data, sem setor, grupos com amostra pequena). Calar sobre o excluído é a forma mais comum de o número mentir.",
    "- Grupo com amostra pequena não entra em ranking. Se a ferramenta marcou `amostraPequena` ou `amostraInsuficiente`, cite fora da ordenação e diga o motivo.",
    "",
    "Privacidade:",
    "- Nunca informe salário, valor de férias, provisão ou custo de UMA pessoa, mesmo que perguntem direto. Dinheiro só sai agregado (por setor, por CNPJ ou do escopo inteiro).",
    "- Pesquisas de clima e eNPS são anônimas por construção e você não tem ferramenta para elas. Não tente inferir a resposta de ninguém a partir de nenhum outro dado.",
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

      const chamadas = resposta.content.filter(c => c.type === "tool_use");

      if (chamadas.length === 0) {
        const final = resposta.content
          .filter(c => c.type === "text")
          .map(c => c.text)
          .join("\n")
          .trim();

        await registrarAuditoria({
          empresaId,
          acao: "ATUALIZAR",
          entidade: "AssistenteRH",
          // A pergunta entra na trilha, a resposta não: ela pode conter dado
          // pessoal de várias pessoas de uma vez. Fica registrado QUEM
          // perguntou O QUÊ — que é o que importa para auditar acesso.
          //
          // O tamanho do escopo entra junto porque a resposta deixou de ser de
          // um CNPJ: sem ele, a trilha diz que a consulta foi na empresa da
          // rota quando na verdade varreu a marca inteira.
          resumo: `Pergunta ao assistente: "${texto.slice(0, 200)}" (escopo: ${escopo.empresaIds.length} CNPJ${escopo.empresaIds.length === 1 ? "" : "s"} da marca ${escopo.marcaNome})${ferramentasUsadas.length ? ` (consultou: ${[...new Set(ferramentasUsadas)].join(", ")})` : ""}.`,
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
          escopo,
          chamada.name,
          (chamada.input ?? {}) as Record<string, unknown>
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
    if (status === 401)
      return { ok: false, erro: "A chave da API foi recusada. Confira ANTHROPIC_API_KEY." };
    if (status === 429)
      return {
        ok: false,
        erro: "Muitas perguntas em sequência. Espere um instante e tente de novo.",
      };
    return {
      ok: false,
      erro: "Não consegui falar com o assistente agora. Tente de novo em instantes.",
    };
  }
}
