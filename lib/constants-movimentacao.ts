export const TIPOS_MOVIMENTACAO = [
  { value: "PROMOCAO", label: "Promoção" },
  { value: "TRANSFERENCIA_SETOR", label: "Transferência de setor" },
  { value: "MUDANCA_SUPERVISOR", label: "Mudança de líder" },
  { value: "MUDANCA_CARGO", label: "Mudança de cargo (lateral)" },
  { value: "OUTRO", label: "Outro" },
] as const;

// Fora da lista acima de propósito: a lista é o que o formulário de
// movimentação oferece, e esta só nasce pela ação "Transferir para outra
// empresa" da ficha (OS 11/11/2026, item 6), que move a ficha de verdade.
// Registrar à mão seria anotar uma mudança de CNPJ que não aconteceu.
export const MOVIMENTACAO_TRANSFERENCIA_EMPRESA = "TRANSFERENCIA_EMPRESA";
// Idem: nasce sozinha quando o bloco Vínculo da ficha troca o tipo de
// contrato (OS 11/11/2026, item 11) — o registro acompanha o dado real.
export const MOVIMENTACAO_MUDANCA_CONTRATO = "MUDANCA_TIPO_CONTRATO";

export const tipoMovimentacaoLabel = (v: string) =>
  v === MOVIMENTACAO_TRANSFERENCIA_EMPRESA
    ? "Transferência entre empresas"
    : v === MOVIMENTACAO_MUDANCA_CONTRATO
      ? "Mudança de tipo de contrato"
      : (TIPOS_MOVIMENTACAO.find((t) => t.value === v)?.label ?? v);
