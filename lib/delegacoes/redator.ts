import {
  CRITICIDADES,
  PERIODICIDADES_RETORNO,
  TITULO_MAXIMO,
  type Criticidade,
} from "@/lib/delegacoes/estados";

// O REDATOR: transforma "fulano, resolve o orçamento do gerador da torre 12"
// numa demanda completa — título, critério de aceite, prazo, criticidade,
// evidência e periodicidade.
//
// POR QUE ISTO EXISTE. Delegar exigia nove campos. Quem delega dezenas de
// coisas por dia não preenche nove campos, e o produto que exige isso volta a
// ser o WhatsApp. A decisão da Direção em 29/08/2026 foi direta: "eu só marco
// o colaborador, escrevo o contexto, e o resto a IA faz".
//
// A LINHA QUE NÃO SE CRUZA. O modelo REDIGE, ele não INVENTA FATO. Ele pode
// escrever o título e propor um prazo a partir do que foi dito; não pode
// afirmar valor, nome, número ou combinação que não estejam no contexto. E
// tudo que ele preencheu sem base explícita volta declarado em `assumiu[]`,
// para a tela mostrar antes de virar compromisso — é a diferença entre um
// assistente e um gerador de promessa alheia.
//
// Este arquivo é PURO (monta prompt, normaliza e valida a resposta). Quem fala
// com a Anthropic é lib/actions/delegacoes-ia.ts, no mesmo molde do assistente
// de RH. Assim a regra de normalização tem teste sem gastar token.

/** O que o modelo devolve, antes de passar pela normalização. */
export type PropostaBruta = {
  titulo?: unknown;
  descricao?: unknown;
  criterioAceite?: unknown;
  evidenciaExigida?: unknown;
  criticidade?: unknown;
  prazo?: unknown;
  horasEstimadas?: unknown;
  periodicidadeRetorno?: unknown;
  marcaNome?: unknown;
  area?: unknown;
  assumiu?: unknown;
};

export type Proposta = {
  titulo: string;
  descricao: string;
  criterioAceite: string;
  evidenciaExigida: string;
  criticidade: Criticidade;
  /** "aaaa-mm-dd" — o que vai para o `<input type="date">`. */
  prazo: string;
  /** Esforço esperado, em horas — nunca null: sem base no contexto, cai no padrão. */
  horasEstimadas: number;
  periodicidadeRetorno: string;
  marcaNome: string | null;
  area: string | null;
  /** O que o modelo preencheu SEM o contexto ter dito. A tela mostra. */
  assumiu: string[];
};

/**
 * Evidência que a IA pode exigir. ARQUIVO fica de fora pelo mesmo motivo da
 * tela: a entrega por anexo ainda não existe, e uma demanda que ninguém
 * consegue entregar é pior que uma demanda sem evidência combinada.
 */
export const EVIDENCIAS_DA_IA = ["LINK", "NUMERO", "TEXTO"] as const;

/**
 * Quando o contexto não dá prazo nenhum, o padrão vem da criticidade — e é
 * declarado em `assumiu[]`. Inventar "sexta que vem" porque soa razoável é
 * exatamente o que o classificador da spec §7 proíbe ("nunca inventar prazo
 * que o responsável não citou"); aqui a regra é a mesma, do outro lado.
 */
export const DIAS_PADRAO_POR_CRITICIDADE: Record<Criticidade, number> = { 1: 2, 2: 5, 3: 10 };

/**
 * Quando o contexto não dá base nenhuma para estimar ESFORÇO (diferente de
 * prazo, que é data limite), o padrão é um único número fixo — um dia útil —
 * em vez de uma tabela por criticidade: urgência não prediz tamanho de
 * tarefa, e fingir essa correlação seria pior que um default honesto e único.
 * Sempre declarado em `assumiu[]`, como o prazo.
 */
export const HORAS_ESTIMADAS_PADRAO = 8;
/** Faixa sã: abaixo/acima disto a IA devolveu um número que não faz sentido de esforço. */
const HORAS_ESTIMADAS_MINIMO = 0.5;
const HORAS_ESTIMADAS_MAXIMO = 400;

/** O esquema que o modelo é OBRIGADO a preencher (tool use força a forma). */
export const ESQUEMA_DEMANDA = {
  type: "object" as const,
  properties: {
    titulo: {
      type: "string",
      description: `O que precisa acontecer, em até ${TITULO_MAXIMO} caracteres. Comece por um verbo no infinitivo. Sem "favor", sem "solicito".`,
    },
    descricao: {
      type: "string",
      description:
        "O contexto que o solicitante deu, reescrito de forma clara para quem vai executar. NÃO acrescente informação que não foi dita.",
    },
    criterioAceite: {
      type: "string",
      description:
        "Como saberemos que ficou pronto — verificável, não subjetivo. Deve ser conferível olhando a entrega. Ex.: 'três orçamentos anexados, com prazo de entrega de cada fornecedor'. Nunca 'feito com qualidade'.",
    },
    evidenciaExigida: {
      type: "string",
      enum: [...EVIDENCIAS_DA_IA],
      description: "Que forma de prova a entrega exige. NUMERO para valores e quantidades; LINK quando o resultado vive em algum lugar; TEXTO no resto.",
    },
    criticidade: {
      type: "integer",
      enum: [1, 2, 3],
      description:
        "1 = crítica (para o negócio ou tem data fatal externa), 2 = alta, 3 = normal. Na dúvida, 3 — criticidade inflacionada faz o time ignorar a cobrança.",
    },
    prazo: {
      type: "string",
      description:
        "aaaa-mm-dd. Use a data que o contexto disser ('até sexta', 'dia 10'). Se o contexto NÃO disser prazo, deixe vazio — o sistema aplica o padrão da criticidade.",
    },
    horasEstimadas: {
      type: "number",
      description:
        "Quantas HORAS DE TRABALHO isto deve exigir para concluir — esforço, não confundir com prazo (que é a data limite). Baseie-se na complexidade que o contexto sugere. Se o contexto não dá base nenhuma para estimar, deixe vazio — o sistema aplica um padrão.",
    },
    periodicidadeRetorno: {
      type: "string",
      enum: [...PERIODICIDADES_RETORNO],
      description:
        "Com que frequência o solicitante quer notícia. Tarefa curta: SO_ENTREGA. Coisa longa ou crítica: SEMANAL ou DUAS_POR_SEMANA.",
    },
    marcaNome: {
      type: "string",
      description:
        "A empresa do grupo a que isto se refere, EXATAMENTE como está na lista fornecida. Vazio se o contexto não deixar claro.",
    },
    area: { type: "string", description: "Área ou setor, se o contexto disser. Vazio se não disser." },
    assumiu: {
      type: "array",
      items: { type: "string" },
      description:
        "OBRIGATÓRIO e honesto: cada coisa que você preencheu sem o contexto ter dito, em uma frase curta cada. Ex.: 'prazo: você não disse, assumi 5 dias pela criticidade alta'. Se o contexto disser tudo, devolva lista vazia.",
    },
  },
  required: [
    "titulo",
    "descricao",
    "criterioAceite",
    "evidenciaExigida",
    "criticidade",
    "periodicidadeRetorno",
    "assumiu",
  ],
};

/**
 * As instruções do redator. `hoje` entra como texto porque "sexta que vem" só
 * existe em relação a um dia — sem isso o modelo chuta o ano.
 */
export function montarSistema(params: {
  hoje: string;
  responsavelNome: string;
  marcas: string[];
}): string {
  return [
    "Você transforma um pedido informal da Direção numa DEMANDA bem formada, dentro de um sistema de accountability.",
    "",
    `Hoje é ${params.hoje} (fuso de Brasília). O responsável escolhido é ${params.responsavelNome}.`,
    params.marcas.length > 0
      ? `Empresas do grupo, para o campo marcaNome (use uma DESTAS, exatamente como escrito, ou deixe vazio): ${params.marcas.join(", ")}.`
      : "Não há empresas cadastradas para associar; deixe marcaNome vazio.",
    "",
    "REGRAS INEGOCIÁVEIS:",
    "- Você REDIGE, não INVENTA FATO. Não crie valores, nomes de fornecedor, números de contrato, quantidades ou combinações que o contexto não trouxe. Se o contexto é vago, o título e o critério ficam genéricos — e você diz isso em `assumiu`.",
    "- O critério de aceite tem que ser VERIFICÁVEL por quem pediu, olhando a entrega. Nada de 'bem feito', 'com qualidade', 'conforme combinado'.",
    "- Prazo: só preencha se o contexto indicar. 'Até sexta' você converte para a data. Sem indicação, deixe vazio — NÃO chute.",
    "- Horas estimadas: é esforço de trabalho, não a data limite (isso é o prazo). Só estime se a complexidade descrita der base — 'levantar três orçamentos' é diferente de 'reformular o processo inteiro'. Sem base nenhuma, deixe vazio.",
    "- `assumiu` é o seu compromisso de honestidade: liste tudo que você decidiu por conta própria. Uma pessoa vai ler isso antes de delegar e é o que a protege de mandar um combinado que ela não fez.",
    "- Escreva em português do Brasil, direto, sem elogio e sem preâmbulo. O texto vai ser lido por quem executa.",
  ].join("\n");
}

export type ResultadoNormalizacao =
  | { ok: true; proposta: Proposta }
  | { ok: false; erro: string };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Normaliza e VALIDA o que o modelo devolveu. É aqui que a saída da IA vira
 * dado confiável: campo fora do domínio não passa, prazo no passado não passa,
 * e o que faltou ganha um padrão declarado em `assumiu`.
 *
 * A validação final das seis regras continua sendo de `validarCriacao` na
 * action — esta camada só garante que o objeto chega bem formado até lá.
 */
export function normalizarProposta(
  bruto: PropostaBruta,
  params: { hoje: Date; marcas: string[] },
): ResultadoNormalizacao {
  const assumiu = Array.isArray(bruto.assumiu)
    ? bruto.assumiu.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];

  const titulo = texto(bruto.titulo).slice(0, TITULO_MAXIMO);
  if (!titulo) return { ok: false, erro: "A IA não conseguiu formular um título a partir desse contexto. Escreva um pouco mais sobre o que precisa acontecer." };

  const criterioAceite = texto(bruto.criterioAceite);
  if (!criterioAceite) {
    return { ok: false, erro: "A IA não conseguiu definir como saber que a demanda ficou pronta. Dê mais contexto sobre o resultado esperado." };
  }

  const criticidadeBruta = Number(bruto.criticidade);
  const criticidade = (CRITICIDADES as readonly number[]).includes(criticidadeBruta)
    ? (criticidadeBruta as Criticidade)
    : 3;
  if (criticidade !== criticidadeBruta) {
    assumiu.push("criticidade: assumi normal, porque o contexto não indicou urgência.");
  }

  const evidenciaBruta = texto(bruto.evidenciaExigida).toUpperCase();
  const evidenciaExigida = (EVIDENCIAS_DA_IA as readonly string[]).includes(evidenciaBruta)
    ? evidenciaBruta
    : "TEXTO";

  const periodicidadeBruta = texto(bruto.periodicidadeRetorno).toUpperCase();
  const periodicidadeRetorno = (PERIODICIDADES_RETORNO as readonly string[]).includes(
    periodicidadeBruta,
  )
    ? periodicidadeBruta
    : "SO_ENTREGA";

  // O prazo: aceita só o formato de data, recusa o passado, e cai no padrão da
  // criticidade quando o contexto não disse nada — sempre declarando.
  const hojeIso = diaIso(params.hoje);
  let prazo = texto(bruto.prazo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo) || !dataValida(prazo)) prazo = "";
  if (prazo && prazo < hojeIso) {
    assumiu.push(`prazo: a data sugerida (${prazo}) já passou, então usei o padrão da criticidade.`);
    prazo = "";
  }
  if (!prazo) {
    const dias = DIAS_PADRAO_POR_CRITICIDADE[criticidade];
    prazo = somarDiasIso(hojeIso, dias);
    assumiu.push(
      `prazo: você não disse até quando, assumi ${dias} dia(s) — ${prazo.split("-").reverse().join("/")}.`,
    );
  }

  // Horas estimadas: aceita só número finito e positivo, dentro da faixa sã;
  // fora disso (ausente, zero, negativo, texto, ou um número absurdo), cai no
  // padrão fixo — sempre declarado, mesmo tratamento do prazo.
  const horasBrutas = Number(bruto.horasEstimadas);
  let horasEstimadas: number;
  if (
    !Number.isFinite(horasBrutas) ||
    horasBrutas < HORAS_ESTIMADAS_MINIMO ||
    horasBrutas > HORAS_ESTIMADAS_MAXIMO
  ) {
    horasEstimadas = HORAS_ESTIMADAS_PADRAO;
    assumiu.push(
      `horas estimadas: você não deu base para estimar o esforço, assumi ${HORAS_ESTIMADAS_PADRAO}h.`,
    );
  } else {
    // Arredonda para a meia hora — precisão maior que essa seria fingida.
    horasEstimadas = Math.round(horasBrutas * 2) / 2;
  }

  // Marca só vale se casar com o cadastro. Nome parecido não serve: seria
  // etiquetar a demanda com uma empresa que ninguém escolheu.
  const marcaBruta = texto(bruto.marcaNome);
  const marcaNome = params.marcas.find((m) => m.toLowerCase() === marcaBruta.toLowerCase()) ?? null;
  if (marcaBruta && !marcaNome) {
    assumiu.push(`empresa: "${marcaBruta}" não está no cadastro, então deixei sem empresa.`);
  }

  return {
    ok: true,
    proposta: {
      titulo,
      descricao: texto(bruto.descricao),
      criterioAceite,
      evidenciaExigida,
      criticidade,
      prazo,
      horasEstimadas,
      periodicidadeRetorno,
      marcaNome,
      area: texto(bruto.area) || null,
      assumiu,
    },
  };
}

/** "aaaa-mm-dd" do dia em Brasília — mesma convenção de lib/datas.ts. */
function diaIso(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

function dataValida(iso: string): boolean {
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (Number.isNaN(t)) return false;
  // Rejeita 30/02 e afins, que o parser aceita rolando para o mês seguinte —
  // o mesmo defeito que a revisão do PR 2 pegou em `prazoDoFormulario`.
  return new Date(t).toISOString().slice(0, 10) === iso;
}

function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
