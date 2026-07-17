import type { RegraConfig } from "@/lib/bonificacao";

// Configuração da política de bonificação vigente descrita na OS
// (OS-regras-bonificacao.md). Usada para pré-cadastrar a regra corrente no seed
// e como valores de partida na aba de Regras.

const SERVICOS_VENDEDOR: RegraConfig["servicos"] = {
  internet: {
    tipo: "faixas",
    faixas: [
      { min: 20, max: 29, valor: 10 },
      { min: 30, max: 39, valor: 15 },
      { min: 40, max: null, valor: 20 },
    ],
  },
  chip: { tipo: "meta", metaQtd: 15, valor: 5 },
  gps: { tipo: "porVenda", valor: 5 },
  tv: { tipo: "porVenda", valor: 5 },
  streaming: { tipo: "porVenda", valor: 5 },
  telefoniaFixa: { tipo: "porVenda", valor: 5 },
};

export const REGRAS_DEFAULT: Record<string, RegraConfig> = {
  VENDEDOR_EXTERNO: { servicos: { ...SERVICOS_VENDEDOR } },
  SUPERVISOR: {
    servicos: { ...SERVICOS_VENDEDOR },
    supervisor: { metaPorPessoa: 20, larguraPorPessoa: 10, valoresFaixa: [2, 3, 4] },
  },
  ATENDIMENTO_ADM: {
    servicos: {
      internet: { tipo: "porVenda", valor: 20 },
      demaisServicos: { tipo: "percentualValor", percentual: 0.5 },
    },
  },
  OUTRO_SETOR: { servicos: {} },
};
