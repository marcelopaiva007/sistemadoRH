export const TIPOS_BENEFICIO = [
  { value: "VALE_TRANSPORTE", label: "Vale-transporte" },
  { value: "VALE_REFEICAO", label: "Vale-refeição" },
  { value: "VALE_ALIMENTACAO", label: "Vale-alimentação" },
  { value: "PLANO_SAUDE", label: "Plano de saúde" },
  { value: "PLANO_ODONTOLOGICO", label: "Plano odontológico" },
  { value: "SEGURO_VIDA", label: "Seguro de vida" },
  { value: "AUXILIO_CRECHE", label: "Auxílio-creche" },
  { value: "AUXILIO_EDUCACAO", label: "Auxílio-educação" },
  { value: "COMBUSTIVEL", label: "Combustível / deslocamento" },
  { value: "CELULAR", label: "Celular corporativo" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const tipoBeneficioLabel = (v: string) =>
  TIPOS_BENEFICIO.find((t) => t.value === v)?.label ?? v;

/** "R$ 1.234,56" — null vira travessão. */
export function formatarReais(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Lê valor monetário digitado pelo RH. Aceita "1.234,56" (formato brasileiro) e
 * "1234.56". Devolve null para vazio ou não numérico.
 */
export function lerValorMonetario(bruto: FormDataEntryValue | null): number | null {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (texto === "") return null;
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
