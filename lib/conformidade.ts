// Motor de conformidade SST: cruza o que a FUNÇÃO exige com o que a PESSOA
// comprovou.
//
// Nada aqui é materializado no banco. "Fulano está irregular" é sempre
// calculado na hora, a partir dos requisitos da posição e dos certificados e
// exames existentes — um campo de status seria mais uma coisa para alguém
// lembrar de atualizar, e é exatamente aí que controle de treinamento apodrece.
//
// Regra de leitura de validade: um certificado/exame sem `validoAte` é tratado
// como permanente (existe treinamento sem reciclagem obrigatória). O que tem
// data vira EM_DIA, VENCENDO ou VENCIDO conforme a janela de alerta.
import { diferencaEmDiasUTC, hojeUTC, somarMesesUTC } from "@/lib/datas";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import type { StatusBadgeMap } from "@/components/status-badge";

export type SituacaoItem = "EM_DIA" | "VENCENDO" | "VENCIDO" | "NUNCA_FEITO";

export type CertificadoParaCalculo = {
  norma: string;
  realizadoEm: Date;
  validoAte: Date | null;
};

export type RequisitoParaCalculo = {
  norma: string;
  validadeMeses: number | null;
};

export type ItemConformidade = {
  norma: string;
  situacao: SituacaoItem;
  /** Do certificado mais recente da norma; null quando nunca foi feito. */
  realizadoEm: Date | null;
  validoAte: Date | null;
  /** Dias até vencer (negativo = vencido); null quando não se aplica. */
  diasAteVencer: number | null;
};

export type ConformidadeColaborador = {
  itens: ItemConformidade[];
  regular: boolean;
  pendencias: ItemConformidade[];
};

const PESO: Record<SituacaoItem, number> = { VENCIDO: 0, NUNCA_FEITO: 1, VENCENDO: 2, EM_DIA: 3 };

function situacaoPorValidade(validoAte: Date | null, hoje: Date): { situacao: SituacaoItem; dias: number | null } {
  if (!validoAte) return { situacao: "EM_DIA", dias: null };
  const dias = diferencaEmDiasUTC(validoAte, hoje);
  if (dias < 0) return { situacao: "VENCIDO", dias };
  if (dias <= DIAS_ALERTA_VENCIMENTO) return { situacao: "VENCENDO", dias };
  return { situacao: "EM_DIA", dias };
}

/**
 * Situação de um colaborador diante dos requisitos da função dele. Certificados
 * de normas que a função não exige são ignorados aqui de propósito: eles
 * aparecem na ficha, mas não entram na conta de conformidade.
 */
export function conformidadeDoColaborador(
  requisitos: RequisitoParaCalculo[],
  certificados: CertificadoParaCalculo[],
  hoje: Date = hojeUTC(),
): ConformidadeColaborador {
  const itens = requisitos.map<ItemConformidade>((requisito) => {
    // O mais recente vale: reciclagem substitui o treinamento anterior.
    const maisRecente = certificados
      .filter((c) => c.norma === requisito.norma)
      .sort((a, b) => b.realizadoEm.getTime() - a.realizadoEm.getTime())[0];

    if (!maisRecente) {
      return { norma: requisito.norma, situacao: "NUNCA_FEITO", realizadoEm: null, validoAte: null, diasAteVencer: null };
    }

    const { situacao, dias } = situacaoPorValidade(maisRecente.validoAte, hoje);
    return {
      norma: requisito.norma,
      situacao,
      realizadoEm: maisRecente.realizadoEm,
      validoAte: maisRecente.validoAte,
      diasAteVencer: dias,
    };
  });

  itens.sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || a.norma.localeCompare(b.norma));
  const pendencias = itens.filter((i) => i.situacao === "VENCIDO" || i.situacao === "NUNCA_FEITO");

  return { itens, regular: pendencias.length === 0, pendencias };
}

export type SituacaoExame = {
  situacao: SituacaoItem;
  realizadoEm: Date | null;
  validoAte: Date | null;
  diasAteVencer: number | null;
  resultado: string | null;
  restricoes: string | null;
};

/**
 * Situação do exame ocupacional. O demissional é ignorado: ele encerra o
 * vínculo e não é o exame que mantém alguém apto para trabalhar.
 */
export function situacaoDoExame(
  exames: { tipo: string; realizadoEm: Date; validoAte: Date | null; resultado: string; restricoes: string | null }[],
  hoje: Date = hojeUTC(),
): SituacaoExame {
  const vigentes = exames
    .filter((e) => e.tipo !== "DEMISSIONAL")
    .sort((a, b) => b.realizadoEm.getTime() - a.realizadoEm.getTime());
  const atual = vigentes[0];

  if (!atual) {
    return { situacao: "NUNCA_FEITO", realizadoEm: null, validoAte: null, diasAteVencer: null, resultado: null, restricoes: null };
  }

  const { situacao, dias } = situacaoPorValidade(atual.validoAte, hoje);
  return {
    situacao,
    realizadoEm: atual.realizadoEm,
    validoAte: atual.validoAte,
    diasAteVencer: dias,
    resultado: atual.resultado,
    restricoes: atual.restricoes,
  };
}

/** Validade sugerida a partir da data de realização e da periodicidade. */
export function calcularValidade(realizadoEm: Date, validadeMeses: number | null): Date | null {
  return validadeMeses && validadeMeses > 0 ? somarMesesUTC(realizadoEm, validadeMeses) : null;
}

export const SITUACAO_LABEL: Record<SituacaoItem, string> = {
  EM_DIA: "Em dia",
  VENCENDO: "Vencendo",
  VENCIDO: "Vencido",
  NUNCA_FEITO: "Nunca feito",
};

/**
 * Ao lado de SITUACAO_LABEL para os dois nunca divergirem — consumido por
 * StatusBadge (components/status-badge.tsx). Substitui o VARIANTE local
 * duplicado em conformidade-view.tsx e seguranca-card.tsx (mesmos 4 valores,
 * mesma tradução, copiado byte a byte nos dois arquivos).
 */
export const SITUACAO_BADGE: StatusBadgeMap<SituacaoItem> = {
  EM_DIA: { label: SITUACAO_LABEL.EM_DIA, variant: "default" },
  VENCENDO: { label: SITUACAO_LABEL.VENCENDO, variant: "secondary" },
  VENCIDO: { label: SITUACAO_LABEL.VENCIDO, variant: "destructive" },
  NUNCA_FEITO: { label: SITUACAO_LABEL.NUNCA_FEITO, variant: "destructive" },
};
