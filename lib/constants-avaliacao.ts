// Ciclos 90/180/360°: 90 = só o gestor avalia; 180 = autoavaliação + gestor;
// 360 = os dois anteriores mais avaliadores extras (par/subordinado)
// escolhidos à mão pelo RH — não há nomeação automática de pares.
export const TIPOS_CICLO = [
  { value: "90", label: "90° — só gestor" },
  { value: "180", label: "180° — autoavaliação + gestor" },
  { value: "360", label: "360° — múltiplas fontes" },
] as const;

export const tipoCicloLabel = (v: string) => TIPOS_CICLO.find((t) => t.value === v)?.label ?? v;

// Quais avaliadores "Gerar avaliações" cria automaticamente para cada tipo de
// ciclo. Para 360, PAR/SUBORDINADO entram depois, um a um, pelo botão de
// avaliador extra — não têm como ser inferidos.
export const AVALIADORES_AUTOMATICOS: Record<string, readonly string[]> = {
  "90": ["GESTOR"],
  "180": ["AUTOAVALIACAO", "GESTOR"],
  "360": ["AUTOAVALIACAO", "GESTOR"],
};

export const TIPOS_AVALIADOR = [
  { value: "AUTOAVALIACAO", label: "Autoavaliação" },
  { value: "GESTOR", label: "Gestor" },
  { value: "PAR", label: "Par" },
  { value: "SUBORDINADO", label: "Subordinado" },
] as const;

export const tipoAvaliadorLabel = (v: string) => TIPOS_AVALIADOR.find((t) => t.value === v)?.label ?? v;

// Catálogo fixo — mesmo padrão dos catálogos de EPI/offboarding. Notas de 1 a
// 5 por competência; a nota final da avaliação é a média das seis.
export const COMPETENCIAS = [
  { value: "QUALIDADE_TECNICA", label: "Qualidade técnica" },
  { value: "PRODUTIVIDADE", label: "Produtividade" },
  { value: "TRABALHO_EM_EQUIPE", label: "Trabalho em equipe" },
  { value: "COMUNICACAO", label: "Comunicação" },
  { value: "PONTUALIDADE_ASSIDUIDADE", label: "Pontualidade e assiduidade" },
  { value: "POSTURA_ATITUDE", label: "Postura e atitude" },
] as const;

export const competenciaLabel = (v: string) => COMPETENCIAS.find((c) => c.value === v)?.label ?? v;

export const NIVEIS_POTENCIAL = [
  { value: "BAIXO", label: "Baixo" },
  { value: "MEDIO", label: "Médio" },
  { value: "ALTO", label: "Alto" },
] as const;

export const potencialLabel = (v: string) => NIVEIS_POTENCIAL.find((p) => p.value === v)?.label ?? v;

// Eixo de desempenho do nine-box, a partir da média de competências (1 a 5)
// da avaliação tipo GESTOR — o mesmo corte de faixas usado no rótulo.
export function faixaDesempenho(notaFinal: number): "BAIXO" | "MEDIO" | "ALTO" {
  if (notaFinal < 2.5) return "BAIXO";
  if (notaFinal < 3.75) return "MEDIO";
  return "ALTO";
}
