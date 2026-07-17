// Cálculo puro da bonificação — SEM dependência de banco (Prisma), para permitir
// testes de unidade e reuso. A camada com acesso a dados fica em lib/bonificacao.ts.
//
// Cada serviço tem um mecanismo de cálculo próprio (OS de bonificação):
//  - faixas:          valor por venda da faixa atingida, aplicado a TODAS as
//                     vendas do período (não-progressivo). Internet de Vendas
//                     Externas.
//  - meta:            paga valor × qtd quando a qtd atinge a meta; 0 abaixo. Chip.
//  - porVenda:        valor × qtd desde a 1ª venda, sem meta. Demais serviços e
//                     internet do Atendimento/ADM (R$20).
//  - percentualValor: percentual × valorDemaisServicos. Regra dos 50% do ADM.

export type ServicoRegra =
  | { tipo: "faixas"; faixas: { min: number; max: number | null; valor: number }[] }
  | { tipo: "meta"; metaQtd: number; valor: number }
  | { tipo: "porVenda"; valor: number }
  | { tipo: "percentualValor"; percentual: number };

export type SupervisorConfig = {
  metaPorPessoa: number;
  larguraPorPessoa: number;
  valoresFaixa: number[];
};

export type ServicoKey =
  | "internet"
  | "chip"
  | "gps"
  | "tv"
  | "streaming"
  | "telefoniaFixa"
  | "demaisServicos";

export type RegraConfig = {
  servicos: Partial<Record<ServicoKey, ServicoRegra>>;
  supervisor?: SupervisorConfig;
};

export function periodoParaIntervalo(periodo: string) {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59));
  return { inicio, fim };
}

export type LancamentoAgregado = {
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  valorDemaisServicos: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdTv: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
};

const AGREGADO_ZERO: LancamentoAgregado = {
  quantidade: 0,
  aprovado: 0,
  cancelado: 0,
  valorInstalado: 0,
  valorDemaisServicos: 0,
  qtdInternet: 0,
  qtdChip: 0,
  qtdGps: 0,
  qtdTv: 0,
  qtdStreaming: 0,
  qtdTelefoniaFixa: 0,
};

export function somaLancamentos(lancamentos: LancamentoAgregado[]): LancamentoAgregado {
  return lancamentos.reduce(
    (acc, l) => ({
      quantidade: acc.quantidade + l.quantidade,
      aprovado: acc.aprovado + l.aprovado,
      cancelado: acc.cancelado + l.cancelado,
      valorInstalado: acc.valorInstalado + l.valorInstalado,
      valorDemaisServicos: acc.valorDemaisServicos + l.valorDemaisServicos,
      qtdInternet: acc.qtdInternet + l.qtdInternet,
      qtdChip: acc.qtdChip + l.qtdChip,
      qtdGps: acc.qtdGps + l.qtdGps,
      qtdTv: acc.qtdTv + l.qtdTv,
      qtdStreaming: acc.qtdStreaming + l.qtdStreaming,
      qtdTelefoniaFixa: acc.qtdTelefoniaFixa + l.qtdTelefoniaFixa,
    }),
    { ...AGREGADO_ZERO }
  );
}

// Contagem de vendas associada a cada serviço. `demaisServicos` não tem
// contagem própria (é uma regra por valor), então retorna 0.
function contagemDoServico(servico: ServicoKey, agregado: LancamentoAgregado): number {
  switch (servico) {
    case "internet":
      return agregado.qtdInternet;
    case "chip":
      return agregado.qtdChip;
    case "gps":
      return agregado.qtdGps;
    case "tv":
      return agregado.qtdTv;
    case "streaming":
      return agregado.qtdStreaming;
    case "telefoniaFixa":
      return agregado.qtdTelefoniaFixa;
    case "demaisServicos":
      return 0;
  }
}

export function calcularServico(
  regra: ServicoRegra,
  servico: ServicoKey,
  agregado: LancamentoAgregado
): number {
  switch (regra.tipo) {
    case "faixas": {
      const qtd = contagemDoServico(servico, agregado);
      const faixa = regra.faixas.find(
        (f) => qtd >= f.min && (f.max == null || qtd <= f.max)
      );
      return faixa ? faixa.valor * qtd : 0;
    }
    case "meta": {
      const qtd = contagemDoServico(servico, agregado);
      return qtd >= regra.metaQtd ? regra.valor * qtd : 0;
    }
    case "porVenda": {
      const qtd = contagemDoServico(servico, agregado);
      return regra.valor * qtd;
    }
    case "percentualValor":
      return regra.percentual * agregado.valorDemaisServicos;
  }
}

// Serviços agrupados no bucket "Demais" (tudo que não é internet nem chip).
const SERVICOS_DEMAIS: ServicoKey[] = [
  "gps",
  "tv",
  "streaming",
  "telefoniaFixa",
  "demaisServicos",
];

export type BonificacaoIndividual = {
  valorInternet: number;
  valorChip: number;
  valorDemais: number;
  detalhes: Partial<Record<ServicoKey, number>>;
};

export function calcularBonificacaoIndividual(
  agregado: LancamentoAgregado,
  config: RegraConfig | null
): BonificacaoIndividual {
  const vazio: BonificacaoIndividual = {
    valorInternet: 0,
    valorChip: 0,
    valorDemais: 0,
    detalhes: {},
  };
  if (!config?.servicos) return vazio;

  const detalhes: Partial<Record<ServicoKey, number>> = {};
  let valorInternet = 0;
  let valorChip = 0;
  let valorDemais = 0;

  for (const [key, regra] of Object.entries(config.servicos) as [
    ServicoKey,
    ServicoRegra
  ][]) {
    if (!regra) continue;
    const valor = calcularServico(regra, key, agregado);
    detalhes[key] = valor;
    if (key === "internet") valorInternet += valor;
    else if (key === "chip") valorChip += valor;
    else if (SERVICOS_DEMAIS.includes(key)) valorDemais += valor;
  }

  return { valorInternet, valorChip, valorDemais, detalhes };
}

export type BonificacaoSupervisor = {
  valor: number;
  tamanhoEquipe: number;
  meta: number;
  totalInternetEquipe: number;
  faixaValor: number;
};

// Bônus de supervisor (OS §3.2): calculado só sobre internet, com base no
// total de vendas de internet de toda a equipe (vendedores + o próprio
// supervisor). Meta e largura das faixas escalam com o tamanho da equipe.
//
// ⚠️ A fórmula foi generalizada a partir do único exemplo da OS (equipe de 5).
// Equipes com tamanho ≠ 5 precisam de confirmação do cliente antes de produção.
export function calcularBonificacaoSupervisor(
  supervisor: SupervisorConfig | undefined,
  totalInternetEquipe: number,
  tamanhoEquipe: number
): BonificacaoSupervisor {
  const base: BonificacaoSupervisor = {
    valor: 0,
    tamanhoEquipe,
    meta: 0,
    totalInternetEquipe,
    faixaValor: 0,
  };
  if (!supervisor || tamanhoEquipe <= 0 || supervisor.valoresFaixa.length === 0) {
    return base;
  }

  const meta = supervisor.metaPorPessoa * tamanhoEquipe;
  const largura = supervisor.larguraPorPessoa * tamanhoEquipe;
  base.meta = meta;

  if (totalInternetEquipe < meta || largura <= 0) return base;

  const idxBruto = Math.floor((totalInternetEquipe - meta) / largura);
  const idx = Math.min(Math.max(idxBruto, 0), supervisor.valoresFaixa.length - 1);
  const faixaValor = supervisor.valoresFaixa[idx];

  return {
    ...base,
    faixaValor,
    valor: faixaValor * totalInternetEquipe,
  };
}

export function asRegraConfig(config: unknown): RegraConfig | null {
  if (!config || typeof config !== "object") return null;
  return config as RegraConfig;
}
