// Acompanhamento de metas: a partir das mesmas regras usadas no cálculo da
// bonificação (lib/bonificacao-calc), diz para cada pessoa onde ela está,
// quanto falta para a próxima faixa/meta e monta um feedback determinístico
// ("o que fazer para bater a meta"). Sem IA e sem acesso a banco aqui — a
// camada de dados fica na page/action que chama estas funções.

import {
  calcularBonificacaoIndividual,
  calcularBonificacaoSupervisor,
  type LancamentoAgregado,
  type RegraConfig,
  type ServicoKey,
  type ServicoRegra,
} from "@/lib/bonificacao-calc";

const SERVICO_LABEL: Record<ServicoKey, string> = {
  internet: "Internet",
  chip: "Chip",
  gps: "GPS",
  tv: "TV",
  streaming: "Streaming",
  telefoniaFixa: "Telefonia Fixa",
  demaisServicos: "Demais Serviços",
};

function qtdDoServico(servico: ServicoKey, a: LancamentoAgregado): number {
  switch (servico) {
    case "internet":
      return a.qtdInternet;
    case "chip":
      return a.qtdChip;
    case "gps":
      return a.qtdGps;
    case "tv":
      return a.qtdTv;
    case "streaming":
      return a.qtdStreaming;
    case "telefoniaFixa":
      return a.qtdTelefoniaFixa;
    case "demaisServicos":
      return 0;
  }
}

export type MetaServico = {
  servico: ServicoKey;
  label: string;
  qtdAtual: number;
  // R$/venda da faixa em que a pessoa está hoje (0 se ainda não desbloqueou nada).
  valorPorVendaAtual: number;
  // Quantidade que dispara a próxima faixa/meta (null = já está no topo).
  proximaMeta: number | null;
  faltam: number | null;
  // R$/venda que passa a valer ao atingir a próxima faixa/meta.
  valorPorVendaProxima: number | null;
};

// Extrai o status de meta de cada serviço que tenha faixa (internet) ou meta
// (chip). Serviços "porVenda"/"percentualValor" não têm limiar, então ficam de
// fora do acompanhamento de metas.
export function metasDosServicos(
  config: RegraConfig | null,
  agregado: LancamentoAgregado,
): MetaServico[] {
  if (!config?.servicos) return [];
  const out: MetaServico[] = [];

  for (const [key, regra] of Object.entries(config.servicos) as [
    ServicoKey,
    ServicoRegra,
  ][]) {
    if (!regra) continue;
    const qtd = qtdDoServico(key, agregado);

    if (regra.tipo === "faixas") {
      const faixas = [...regra.faixas].sort((a, b) => a.min - b.min);
      let idx = -1;
      for (let i = 0; i < faixas.length; i++) {
        const fx = faixas[i];
        if (qtd >= fx.min && (fx.max == null || qtd <= fx.max)) idx = i;
      }
      const atual = idx >= 0 ? faixas[idx] : null;
      // Próxima faixa: a seguinte na lista; se ainda está abaixo de tudo, a 1ª.
      const prox =
        idx + 1 < faixas.length
          ? faixas[idx + 1]
          : idx < 0 && faixas.length > 0
            ? faixas[0]
            : null;
      out.push({
        servico: key,
        label: SERVICO_LABEL[key],
        qtdAtual: qtd,
        valorPorVendaAtual: atual ? atual.valor : 0,
        proximaMeta: prox ? prox.min : null,
        faltam: prox ? Math.max(0, prox.min - qtd) : null,
        valorPorVendaProxima: prox ? prox.valor : null,
      });
    } else if (regra.tipo === "meta") {
      const atingiu = qtd >= regra.metaQtd;
      out.push({
        servico: key,
        label: SERVICO_LABEL[key],
        qtdAtual: qtd,
        valorPorVendaAtual: atingiu ? regra.valor : 0,
        proximaMeta: atingiu ? null : regra.metaQtd,
        faltam: atingiu ? null : Math.max(0, regra.metaQtd - qtd),
        valorPorVendaProxima: atingiu ? null : regra.valor,
      });
    }
  }
  return out;
}

export type AcompanhamentoSupervisor = {
  metaEquipe: number;
  internetEquipe: number;
  faltam: number;
  atingiu: boolean;
  valorAtual: number;
};

export type AcompanhamentoFuncionario = {
  funcionarioId: string;
  nome: string;
  cargo: string;
  email: string | null;
  telegramChatId: string | null;
  metas: MetaServico[];
  supervisor: AcompanhamentoSupervisor | null;
  bonificacaoAtual: number;
  mensagem: string;
};

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Monta o feedback textual determinístico a partir das metas em aberto.
export function montarMensagem(
  nome: string,
  metas: MetaServico[],
  supervisor: AcompanhamentoSupervisor | null,
): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] || nome;
  const linhas: string[] = [];

  for (const m of metas) {
    if (m.faltam != null && m.faltam > 0) {
      linhas.push(
        `${m.label}: você tem ${m.qtdAtual} venda(s). Faltam ${m.faltam} para a faixa de ${reais(
          m.valorPorVendaProxima ?? 0,
        )}/venda.`,
      );
    }
  }

  if (supervisor && !supervisor.atingiu && supervisor.faltam > 0) {
    linhas.push(
      `Equipe: ${supervisor.internetEquipe} de ${supervisor.metaEquipe} vendas de internet — faltam ${supervisor.faltam} para o time bater a meta.`,
    );
  }

  if (linhas.length === 0) {
    return `Parabéns, ${primeiroNome}! Você já desbloqueou as metas com bonificação neste mês. Mantenha o ritmo para subir de faixa. 🚀`;
  }

  return `Olá, ${primeiroNome}! ${linhas.join(" ")} 💡 Foque as próximas ativações onde falta menos para a próxima faixa — o ganho por venda aumenta.`;
}

export function calcularAcompanhamento(params: {
  funcionarioId: string;
  nome: string;
  cargo: string;
  email?: string | null;
  telegramChatId?: string | null;
  agregado: LancamentoAgregado;
  config: RegraConfig | null;
  supervisorCtx?: { totalInternetEquipe: number; tamanhoEquipe: number } | null;
}): AcompanhamentoFuncionario {
  const { funcionarioId, nome, cargo, agregado, config, supervisorCtx } = params;

  const metas = metasDosServicos(config, agregado);
  const individual = calcularBonificacaoIndividual(agregado, config);

  let supervisor: AcompanhamentoSupervisor | null = null;
  let valorSupervisor = 0;
  if (cargo === "SUPERVISOR" && config?.supervisor && supervisorCtx) {
    const b = calcularBonificacaoSupervisor(
      config.supervisor,
      supervisorCtx.totalInternetEquipe,
      supervisorCtx.tamanhoEquipe,
    );
    valorSupervisor = b.valor;
    supervisor = {
      metaEquipe: b.meta,
      internetEquipe: b.totalInternetEquipe,
      faltam: Math.max(0, b.meta - b.totalInternetEquipe),
      atingiu: b.valor > 0,
      valorAtual: b.valor,
    };
  }

  const bonificacaoAtual =
    individual.valorInternet +
    individual.valorChip +
    individual.valorDemais +
    valorSupervisor;

  return {
    funcionarioId,
    nome,
    cargo,
    email: params.email ?? null,
    telegramChatId: params.telegramChatId ?? null,
    metas,
    supervisor,
    bonificacaoAtual,
    mensagem: montarMensagem(nome, metas, supervisor),
  };
}
