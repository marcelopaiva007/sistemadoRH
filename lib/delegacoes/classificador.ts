// O CLASSIFICADOR (spec §7) — "o filtro que protege a Direção". A resposta em
// texto livre do responsável vira um de 4 baldes, e só UM interrompe a
// Direção. Mesmo molde de lib/delegacoes/redator.ts: este arquivo é PURO
// (schema, prompt, normalização); quem fala com a Anthropic é
// lib/delegacoes/classificar.ts.
//
// A LINHA QUE NÃO SE CRUZA (idêntica ao redator, do outro lado): o modelo LÊ,
// não INVENTA. `prazoSugerido` só existe se o responsável citou uma data;
// `bloqueador` só existe se ele nomeou o que trava; `resumo` só pode conter o
// que está no texto dele. E a regra que dá nome ao arquivo: confiança baixa
// NUNCA vira "precisa da sua decisão" — incerteza não é motivo para
// interromper quem está no topo.

export const CLASSIFICACOES = [
  "NO_PRAZO",
  "EM_RISCO",
  "TRAVADO_DEPENDENCIA",
  "PRECISA_DECISAO_SUA",
] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const RESUMO_MAXIMO = 140;
/** Abaixo disto, a classificação vira EM_RISCO — nunca PRECISA_DECISAO_SUA. */
export const CONFIANCA_MINIMA = 0.6;

export type ClassificacaoBruta = {
  classificacao?: unknown;
  prazoSugerido?: unknown;
  bloqueador?: unknown;
  resumo?: unknown;
  confianca?: unknown;
};

export type Resultado = {
  classificacao: Classificacao;
  /** "aaaa-mm-dd" ou null — nunca inventado. */
  prazoSugerido: string | null;
  /** Quem/o que trava, como o responsável descreveu — ou null. */
  bloqueador: string | null;
  /** Até RESUMO_MAXIMO caracteres, factual. */
  resumo: string;
  confianca: number;
};

export const ESQUEMA_CLASSIFICACAO = {
  type: "object" as const,
  properties: {
    classificacao: {
      type: "string",
      enum: [...CLASSIFICACOES],
      description:
        "NO_PRAZO: está indo bem, sem sinal de atraso ou dúvida. EM_RISCO: pode atrasar, ou algo preocupa, mas o responsável não pediu nada de você. TRAVADO_DEPENDENCIA: parado esperando outra pessoa ou outra coisa. PRECISA_DECISAO_SUA: o responsável está pedindo que VOCÊ (quem delegou) decida, autorize ou responda algo — sem isso ele não segue.",
    },
    prazoSugerido: {
      type: "string",
      description:
        "aaaa-mm-dd. SÓ preencha se o responsável citou uma data nova explicitamente. Se ele não deu data nenhuma, deixe vazio — nunca chute.",
    },
    bloqueador: {
      type: "string",
      description:
        "Quem ou o que está travando, EXATAMENTE como o responsável descreveu (ex.: 'fornecedor não respondeu', 'depende do jurídico'). Vazio se não há bloqueio nomeado.",
    },
    resumo: {
      type: "string",
      description: `Até ${RESUMO_MAXIMO} caracteres. Só o que está no texto do responsável — nenhuma opinião, nenhuma inferência do que ele "quis dizer".`,
    },
    confianca: {
      type: "number",
      description: "0.0 a 1.0 — quão certo você está desta classificação, dado o texto recebido.",
    },
  },
  required: ["classificacao", "resumo", "confianca"],
};

export function montarSistemaClassificador(params: {
  titulo: string;
  criterioAceite: string;
  prazoTexto: string;
  diasRestantes: number;
  repactuacoes: { data: string; motivo: string }[];
}): string {
  const quando =
    params.diasRestantes < 0
      ? `${Math.abs(params.diasRestantes)} dia(s) ATRASADA`
      : params.diasRestantes === 0
        ? "vence HOJE"
        : `${params.diasRestantes} dia(s) até o prazo`;
  const historico =
    params.repactuacoes.length > 0
      ? params.repactuacoes.map((r) => `- ${r.data}: ${r.motivo}`).join("\n")
      : "Nenhuma repactuação até agora.";

  return [
    "Você classifica a resposta de um responsável sobre uma demanda, dentro de um sistema de accountability. A Direção só quer ser interrompida quando REALMENTE precisa decidir algo — sua classificação é o filtro que protege o tempo dela.",
    "",
    `Demanda: "${params.titulo}"`,
    `Como se sabe que ficou pronto: ${params.criterioAceite}`,
    `Prazo: ${params.prazoTexto} (${quando})`,
    "Histórico de repactuações desta demanda:",
    historico,
    "",
    "REGRAS INEGOCIÁVEIS:",
    "- Você LÊ o que o responsável escreveu, não INVENTA. `prazoSugerido` e `bloqueador` só existem se ele disse isso explicitamente — em branco quando ele não disse.",
    "- `resumo` é só o FATO do que ele escreveu, nunca sua interpretação do que ele quis dizer.",
    "- PRECISA_DECISAO_SUA é para quando o responsável está pedindo algo de VOCÊ — uma autorização, uma resposta, uma escolha. 'Estou esperando o fornecedor' é TRAVADO_DEPENDENCIA, não uma decisão sua. Só marque PRECISA_DECISAO_SUA quando o pedido é claramente dirigido a quem delegou.",
    "- Se você não tem certeza, `confianca` baixa é a resposta honesta — não é motivo para marcar PRECISA_DECISAO_SUA 'por garantia'. Incerteza nunca deve interromper a Direção.",
  ].join("\n");
}

export type ResultadoNormalizacao = { ok: true; resultado: Resultado } | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (Number.isNaN(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === iso;
}

/**
 * Normaliza e VALIDA a saída do modelo. É aqui que a regra que dá nome ao
 * arquivo vira código: `confianca < CONFIANCA_MINIMA` força EM_RISCO — não
 * interessa o que o modelo tenha dito, porque incerteza nunca é motivo para
 * interromper a Direção com PRECISA_DECISAO_SUA (e nem com nada além do
 * baseline de atenção).
 */
export function normalizarClassificacao(bruto: ClassificacaoBruta): ResultadoNormalizacao {
  const resumo = texto(bruto.resumo).slice(0, RESUMO_MAXIMO);
  if (!resumo) return { ok: false, erro: "O modelo não devolveu um resumo." };

  const confiancaBruta = Number(bruto.confianca);
  const confianca = Number.isFinite(confiancaBruta) ? Math.min(1, Math.max(0, confiancaBruta)) : 0;

  const classificacaoBruta = texto(bruto.classificacao).toUpperCase();
  let classificacao: Classificacao = (CLASSIFICACOES as readonly string[]).includes(classificacaoBruta)
    ? (classificacaoBruta as Classificacao)
    : "EM_RISCO"; // fora do domínio: trata como o baseline de atenção, não descarta.

  // A REGRA: confiança baixa força EM_RISCO, sempre — é o que impede um
  // "PRECISA_DECISAO_SUA" chutado de acordar a Direção às 2h da manhã.
  if (confianca < CONFIANCA_MINIMA) classificacao = "EM_RISCO";

  const prazoBruta = texto(bruto.prazoSugerido);
  const prazoSugerido = prazoBruta && dataValida(prazoBruta) ? prazoBruta : null;

  const bloqueadorBruto = texto(bruto.bloqueador);
  const bloqueador = bloqueadorBruto ? bloqueadorBruto.slice(0, 200) : null;

  return { ok: true, resultado: { classificacao, prazoSugerido, bloqueador, resumo, confianca } };
}
