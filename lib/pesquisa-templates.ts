// Templates de pesquisa de clima — versão completa (anual) e reduzida (pulso).
// Usados pelo cron de gestão de ciclo e pela criação manual via script.

export const TEMPLATE_CLIMA_COMPLETO = [
  {
    dimensao: "CREDIBILIDADE",
    enunciados: [
      "A empresa cumpre os compromissos que assume com os colaboradores",
      "A liderança é honesta e transparente na comunicação",
      "Existe coerência entre o que é dito e o que é feito na empresa",
      "A empresa oferece benefícios e remuneração justos",
    ],
  },
  {
    dimensao: "RESPEITO",
    enunciados: [
      "Sua opinião é ouvida e considerada nas decisões que afetam seu trabalho",
      "A empresa respeita a vida pessoal e o tempo livre dos colaboradores",
      "As pessoas são tratadas com equidade, independentemente de cargo ou origem",
      "A empresa valoriza o desenvolvimento profissional dos colaboradores",
    ],
  },
  {
    dimensao: "IMPARCIALIDADE",
    enunciados: [
      "As decisões sobre promoções e aumentos são justas e imparciais",
      "A empresa oferece igualdade de oportunidades para todos",
      "As políticas e regras são aplicadas de forma consistente",
      "Não há favoritismo nas decisões de gestão",
    ],
  },
  {
    dimensao: "ORGULHO",
    enunciados: [
      "Você se sente orgulhoso em trabalhar para esta empresa",
      "A empresa oferece produtos/serviços de qualidade que você valoriza",
      "O propósito e a missão da empresa fazem sentido",
      "Você recomendaria esta empresa como um bom lugar para trabalhar",
    ],
  },
  {
    dimensao: "CAMARADAGEM",
    enunciados: [
      "Você tem bom relacionamento com seus colegas de trabalho",
      "Há espírito de trabalho em equipe e colaboração",
      "As pessoas se ajudam para resolver problemas",
      "Existe um ambiente de confiança entre os colaboradores",
    ],
  },
];

// Pulso: 1 pergunta-síntese por dimensão + NPS. Total 6 perguntas.
export const TEMPLATE_CLIMA_PULSO = [
  {
    dimensao: "CREDIBILIDADE",
    enunciados: ["Confio na liderança e na comunicação da empresa"],
  },
  {
    dimensao: "RESPEITO",
    enunciados: ["Sou tratado com respeito e minha opinião é valorizada"],
  },
  {
    dimensao: "IMPARCIALIDADE",
    enunciados: ["As decisões são tomadas com critério e equidade"],
  },
  {
    dimensao: "ORGULHO",
    enunciados: ["Sinto orgulho de trabalhar nesta empresa"],
  },
  {
    dimensao: "CAMARADAGEM",
    enunciados: ["Tenho bom relacionamento de trabalho com minha equipe"],
  },
];

export function ehPulse(pesquisa: { titulo: string; descricao: string | null }): boolean {
  return (
    pesquisa.titulo.toLowerCase().includes("pulso") ||
    (pesquisa.descricao?.toLowerCase().includes("pulso") ?? false)
  );
}

export function totalPerguntas(tipo: "COMPLETO" | "PULSO"): number {
  if (tipo === "PULSO") {
    return TEMPLATE_CLIMA_PULSO.reduce((s, d) => s + d.enunciados.length, 0) + 1; // +1 NPS
  }
  return TEMPLATE_CLIMA_COMPLETO.reduce((s, d) => s + d.enunciados.length, 0) + 1; // +1 NPS
}
