// Modelo da Avaliação de Riscos Psicossociais (NR-01 / PGR).
//
// 35 perguntas fixas em 6 dimensões psicossociais, escala de frequência
// 0 (Nunca) a 4 (Sempre). Perguntas de FATOR DE PROTEÇÃO (invertida = true,
// ex.: "Tenho liberdade de escolha") pontuam risco como 4 - resposta;
// perguntas de FATOR DE RISCO (ex.: "Tenho prazos inatingíveis") pontuam
// risco = resposta. A ordem/código (01-35) segue o formulário original do
// engenheiro de SST — não reordenar, o relatório referencia os códigos.

export const ESCALA_FREQ_0_4 = [
  { valor: 0, label: "Nunca" },
  { valor: 1, label: "Raramente" },
  { valor: 2, label: "Às vezes" },
  { valor: 3, label: "Frequentemente" },
  { valor: 4, label: "Sempre" },
] as const;

export type DimensaoNR01 =
  | "DEMANDA"
  | "AUTONOMIA"
  | "SUPORTE_GESTOR"
  | "SUPORTE_COLEGAS"
  | "CLIMA_CONFLITOS"
  | "CLAREZA_MUDANCAS";

export const DIMENSOES_NR01: Record<
  DimensaoNR01,
  { label: string; descricao: string }
> = {
  DEMANDA: {
    label: "Demanda e Carga de Trabalho",
    descricao:
      "Intensidade, ritmo, prazos e possibilidade de pausas no trabalho.",
  },
  AUTONOMIA: {
    label: "Autonomia e Controle",
    descricao:
      "Liberdade de decidir como, quando e o que fazer no próprio trabalho.",
  },
  SUPORTE_GESTOR: {
    label: "Suporte do Gestor e Emocional",
    descricao:
      "Apoio, confiança e incentivo da liderança; exigência emocional do trabalho.",
  },
  SUPORTE_COLEGAS: {
    label: "Suporte dos Colegas",
    descricao: "Ajuda, apoio e respeito entre colegas de trabalho.",
  },
  CLIMA_CONFLITOS: {
    label: "Clima, Conflitos e Perseguição",
    descricao:
      "Tratamento duro, conflitos interpessoais, tensão e percepção de perseguição.",
  },
  CLAREZA_MUDANCAS: {
    label: "Clareza de Papel, Mudanças e Propósito",
    descricao:
      "Clareza de tarefas, objetivos e propósito; comunicação e participação nas mudanças.",
  },
};

export type PerguntaNR01 = {
  codigo: string; // "01".."35" — numeração do formulário original
  enunciado: string;
  dimensao: DimensaoNR01;
  invertida: boolean; // true = fator de proteção (risco = 4 - resposta)
};

export const PERGUNTAS_NR01: PerguntaNR01[] = [
  { codigo: "01", enunciado: "Tenho clareza sobre o que se espera do meu trabalho?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "02", enunciado: "Posso decidir quando fazer uma pausa?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "03", enunciado: "As exigências de trabalho feitas por colegas e supervisores são difíceis de combinar?", dimensao: "DEMANDA", invertida: false },
  { codigo: "04", enunciado: "Eu sei como fazer o meu trabalho?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "05", enunciado: "Falam ou se comportam comigo de forma dura?", dimensao: "CLIMA_CONFLITOS", invertida: false },
  { codigo: "06", enunciado: "Tenho prazos inatingíveis?", dimensao: "DEMANDA", invertida: false },
  { codigo: "07", enunciado: "Quando o trabalho se torna difícil posso contar com ajuda dos colegas?", dimensao: "SUPORTE_COLEGAS", invertida: true },
  { codigo: "08", enunciado: "Recebo informações e suporte que me ajudam no trabalho que eu faço?", dimensao: "SUPORTE_GESTOR", invertida: true },
  { codigo: "09", enunciado: "Devo trabalhar muito intensamente?", dimensao: "DEMANDA", invertida: false },
  { codigo: "10", enunciado: "Consideram a minha opinião sobre a velocidade do meu trabalho?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "11", enunciado: "Estão claras as minhas tarefas e responsabilidades?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "12", enunciado: "Eu não faço algumas tarefas porque tenho muita coisa para fazer?", dimensao: "DEMANDA", invertida: false },
  { codigo: "13", enunciado: "Os objetivos e metas do meu setor são claros para mim?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "14", enunciado: "Existem conflitos entre os colegas?", dimensao: "CLIMA_CONFLITOS", invertida: false },
  { codigo: "15", enunciado: "Tenho liberdade de escolha de como fazer meu trabalho?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "16", enunciado: "Não tenho possibilidade de fazer pausas suficientes?", dimensao: "DEMANDA", invertida: false },
  { codigo: "17", enunciado: "Eu vejo como o meu trabalho se encaixa nos objetivos da empresa?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "18", enunciado: "Recebo pressão para trabalhar em outro horário?", dimensao: "DEMANDA", invertida: false },
  { codigo: "19", enunciado: "Tenho liberdade de escolha para decidir o que fazer no meu trabalho?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "20", enunciado: "Tenho que fazer meu trabalho com muita rapidez?", dimensao: "DEMANDA", invertida: false },
  { codigo: "21", enunciado: "Sinto que sou perseguido no trabalho?", dimensao: "CLIMA_CONFLITOS", invertida: false },
  { codigo: "22", enunciado: "As pausas temporárias são impossíveis de cumprir?", dimensao: "DEMANDA", invertida: false },
  { codigo: "23", enunciado: "Posso confiar no meu chefe quando eu tiver problemas no trabalho?", dimensao: "SUPORTE_GESTOR", invertida: true },
  { codigo: "24", enunciado: "Meus colegas me ajudam e me dão apoio quando eu preciso?", dimensao: "SUPORTE_COLEGAS", invertida: true },
  { codigo: "25", enunciado: "Minhas sugestões são consideradas sobre como fazer meu trabalho?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "26", enunciado: "Tenho oportunidades para pedir explicações ao chefe sobre as mudanças relacionadas ao meu trabalho?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "27", enunciado: "No trabalho os meus colegas demonstram o respeito que mereço?", dimensao: "SUPORTE_COLEGAS", invertida: true },
  { codigo: "28", enunciado: "As pessoas são sempre consultadas sobre as mudanças no trabalho?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "29", enunciado: "Quando algo no trabalho me perturba ou irrita posso falar com meu chefe?", dimensao: "SUPORTE_GESTOR", invertida: true },
  { codigo: "30", enunciado: "O meu horário de trabalho pode ser flexível?", dimensao: "AUTONOMIA", invertida: true },
  { codigo: "31", enunciado: "Os colegas estão disponíveis para escutar os meus problemas de trabalho?", dimensao: "SUPORTE_COLEGAS", invertida: true },
  { codigo: "32", enunciado: "Quando há mudanças faço o meu trabalho com o mesmo carinho?", dimensao: "CLAREZA_MUDANCAS", invertida: true },
  { codigo: "33", enunciado: "Tenho suportado trabalhos emocionalmente exigentes?", dimensao: "SUPORTE_GESTOR", invertida: false },
  { codigo: "34", enunciado: "As relações no trabalho são tensas?", dimensao: "CLIMA_CONFLITOS", invertida: false },
  { codigo: "35", enunciado: "Meu chefe me incentiva no trabalho?", dimensao: "SUPORTE_GESTOR", invertida: true },
];

// Plano de ação recomendado por dimensão — usado no relatório NR-01/PGR quando
// a dimensão atinge nível MÉDIO ou pior. Ações genéricas de SST/RH; o
// engenheiro de SST que atende a empresa ajusta prazos e responsáveis.
export const PLANO_ACAO_NR01: Record<DimensaoNR01, string[]> = {
  DEMANDA: [
    "Revisar o dimensionamento das equipes e a distribuição de tarefas nos setores expostos.",
    "Renegociar metas e prazos com participação dos trabalhadores envolvidos.",
    "Instituir e respeitar pausas programadas durante a jornada.",
    "Mapear picos de demanda e criar plano de contingência (reforço temporário, escala).",
  ],
  AUTONOMIA: [
    "Envolver os trabalhadores nas decisões sobre método e ritmo de trabalho.",
    "Delegar a definição da ordem das tarefas sempre que o processo permitir.",
    "Avaliar flexibilização de horários/escala onde o serviço comportar.",
    "Criar canal permanente de sugestões com retorno (feedback) garantido.",
  ],
  SUPORTE_GESTOR: [
    "Capacitar líderes em gestão de pessoas, escuta ativa e feedback (treinamento de liderança).",
    "Instituir conversas individuais periódicas (1:1) entre gestor e equipe.",
    "Criar canal de escuta/apoio psicológico (interno ou convênio) para demandas emocionais.",
    "Incluir apoio ao trabalhador como critério de avaliação dos gestores.",
  ],
  SUPORTE_COLEGAS: [
    "Promover integração entre equipes (onboarding, rodízios assistidos, eventos internos).",
    "Estimular trabalho em pares/mentoria para tarefas difíceis.",
    "Reforçar em treinamento os comportamentos de cooperação e respeito.",
  ],
  CLIMA_CONFLITOS: [
    "Publicar e treinar código de conduta com tolerância zero a assédio e tratamento hostil.",
    "Disponibilizar canal confidencial de denúncias com apuração independente.",
    "Mediar conflitos identificados com apoio do RH e registrar encaminhamentos.",
    "Investigar imediatamente relatos de perseguição (assédio moral) conforme NR-01 e legislação.",
  ],
  CLAREZA_MUDANCAS: [
    "Formalizar descrições de cargo e responsabilidades e revisá-las com os ocupantes.",
    "Comunicar metas do setor e da empresa em reuniões periódicas de alinhamento.",
    "Definir rito de comunicação de mudanças: anunciar, explicar o porquê e abrir espaço para dúvidas.",
    "Consultar os afetados antes de mudanças que alterem rotina, horário ou método de trabalho.",
  ],
};

export const TITULO_PESQUISA_NR01 = "Avaliação de Riscos Psicossociais (NR-01)";
export const DESCRICAO_PESQUISA_NR01 =
  "Pesquisa de fatores de risco psicossocial no trabalho, conforme NR-01/PGR. " +
  "Responda pensando no seu dia a dia de trabalho. Não há resposta certa ou errada. " +
  "As respostas são anônimas e analisadas apenas de forma agregada.";
