// Etapas do funil, na ordem em que aparecem no quadro. TRIAGEM..PROPOSTA são
// as etapas "em andamento"; CONTRATADO/REPROVADO/DESISTIU encerram o
// processo daquele candidato naquela vaga.
import type { BadgeVariant, StatusBadgeMap } from "@/components/status-badge";

export const ETAPAS_FUNIL = [
  { value: "TRIAGEM", label: "Triagem" },
  { value: "ENTREVISTA", label: "Entrevista" },
  { value: "TESTE", label: "Teste / prova" },
  { value: "PROPOSTA", label: "Proposta" },
  { value: "CONTRATADO", label: "Contratado" },
  { value: "REPROVADO", label: "Reprovado" },
  { value: "DESISTIU", label: "Desistiu" },
] as const;

export const etapaFunilLabel = (v: string) => ETAPAS_FUNIL.find((e) => e.value === v)?.label ?? v;

/** Etapas que ainda estão em andamento — o que conta como "candidato ativo". */
export const ETAPAS_EM_ANDAMENTO = ["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA"] as const;

/** Etapas que encerram o processo — não sai delas a não ser reabrindo. */
export const ETAPAS_FINAIS = ["CONTRATADO", "REPROVADO", "DESISTIU"] as const;

export const etapaEncerrada = (etapa: string) =>
  (ETAPAS_FINAIS as readonly string[]).includes(etapa);

export const STATUS_VAGA = [
  { value: "ABERTA", label: "Aberta" },
  { value: "PAUSADA", label: "Pausada" },
  { value: "ENCERRADA", label: "Encerrada" },
] as const;

export const statusVagaLabel = (v: string) => STATUS_VAGA.find((s) => s.value === v)?.label ?? v;

/**
 * Ao lado de STATUS_VAGA para os dois nunca divergirem — consumido por
 * StatusBadge (components/status-badge.tsx). O label vem do próprio catálogo
 * acima, não de uma cópia.
 */
const VARIANTE_VAGA: Record<(typeof STATUS_VAGA)[number]["value"], BadgeVariant> = {
  ABERTA: "default",
  PAUSADA: "outline",
  ENCERRADA: "secondary",
};

export const STATUS_VAGA_BADGE = Object.fromEntries(
  STATUS_VAGA.map((s) => [s.value, { label: s.label, variant: VARIANTE_VAGA[s.value] }]),
) as StatusBadgeMap<(typeof STATUS_VAGA)[number]["value"]>;

export const ORIGENS_CANDIDATO = [
  { value: "RH", label: "Cadastrado pelo RH" },
  { value: "PUBLICO", label: "Inscrição pela página da vaga" },
  { value: "INDICACAO", label: "Indicação" },
] as const;

export const origemCandidatoLabel = (v: string) =>
  ORIGENS_CANDIDATO.find((o) => o.value === v)?.label ?? v;

/**
 * Slug da página pública a partir do título. Sufixo aleatório de propósito: o
 * endereço da vaga não pode ser adivinhável a partir do nome do cargo, senão
 * uma vaga ainda não publicada vazaria por tentativa.
 */
export function gerarSlugVaga(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    // NFD separa o acento em caractere combinante próprio; \p{M} derruba esses
    // combinantes para "Técnico" virar "tecnico", e não "te-cnico".
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const sufixo = Math.random().toString(36).slice(2, 8);
  return `${base || "vaga"}-${sufixo}`;
}
