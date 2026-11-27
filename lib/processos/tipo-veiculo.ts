// Tipo de veículo da frota — pedido do CEO em 09/11/2026: a tabela de Veículos
// separada em carro a combustão, carro elétrico, tuk-tuk, moto a combustão e
// moto elétrica, com numeração dentro de cada tipo e soma geral.
//
// O tipo é DERIVADO de marca/modelo + motorização, sem campo novo no banco: a
// frota importada não tem essa informação gravada, e um campo vazio deixaria
// os 61 veículos fora de qualquer grupo até alguém editar um por um. A regra
// mora aqui, num lugar só, e a tela e o CSV usam a mesma função — os dois não
// podem contar um tuk-tuk como carro de um lado e tuk-tuk do outro.

export type TipoVeiculo =
  | "CARRO_COMBUSTAO"
  | "CARRO_ELETRICO"
  | "TUK_TUK"
  | "MOTO_COMBUSTAO"
  | "MOTO_ELETRICA";

/** Ordem de exibição dos grupos na tela e no CSV. */
export const TIPOS_VEICULO: {
  value: TipoVeiculo;
  label: string;
  icone: string;
}[] = [
  { value: "CARRO_COMBUSTAO", label: "Carro a combustão", icone: "🚗" },
  { value: "CARRO_ELETRICO", label: "Carro elétrico", icone: "⚡" },
  { value: "TUK_TUK", label: "Tuk-tuk", icone: "🛺" },
  { value: "MOTO_COMBUSTAO", label: "Moto a combustão", icone: "🏍️" },
  { value: "MOTO_ELETRICA", label: "Moto elétrica", icone: "🔋" },
];

// Triciclos de carga/passageiro (Centry/Shansu/Jiangsu são os da frota).
const TUK_TUK = /\b(TUK|TUKTUK|TUK-TUK|TRICICLO|CENTRY|SHANSU|JIANGSU)\b/;
// Modelos de moto comuns no Brasil. "\b" evita casar "CG" dentro de outra palavra.
const MOTO =
  /\b(MOTO|MOTOCICLETA|CG|POP|BIZ|TITAN|FACTOR|FAZER|YBR|NXR|BROS|XRE|CBR|NMAX|PCX|CROSSER|LANDER|TENERE|SCOOTER|MOTONETA)\b/;
const MARCA_MOTO =
  /\b(HONDA|YAMAHA|SUZUKI|DAFRA|SHINERAY|HAOJUE|KAWASAKI|VOLTZ|SUPER SOCO)\b/;
// Marcas/modelos 100% elétricos, para a frota importada que ficou com a
// motorização padrão "Combustão".
const ELETRICO =
  /\b(BYD|DOLPHIN|GEELY|EX2|AION|GAC|EV|ELETRICO|ELÉTRICO|ELETRICA|ELÉTRICA|VOLTZ|SUPER SOCO|LEAF|KWID E-TECH|E-TECH|RENAULT ZOE|ZOE)\b/;

export function ehTipoVeiculo(valor: string | null | undefined): valor is TipoVeiculo {
  return TIPOS_VEICULO.some((t) => t.value === valor);
}

/** O tipo DEDUZIDO de marca/modelo/motorização, ignorando o informado à mão. */
export function tipoDeduzidoDoVeiculo(v: {
  marca: string | null;
  modelo: string | null;
  motorizacao: string;
}): TipoVeiculo {
  const texto = `${v.marca ?? ""} ${v.modelo ?? ""}`
    .toUpperCase()
    .replace(/[/]/g, " ");
  const eletrico = v.motorizacao === "ELETRICO" || ELETRICO.test(texto);

  if (TUK_TUK.test(texto)) return "TUK_TUK";
  // A marca sozinha não basta para Honda/Suzuki (fazem carro); só as marcas
  // que só fazem moto (Yamaha, Dafra…) decidem sozinhas.
  const ehMoto =
    MOTO.test(texto) ||
    MARCA_MOTO.test(texto.replace(/\b(HONDA|SUZUKI)\b/g, ""));
  if (ehMoto) return eletrico ? "MOTO_ELETRICA" : "MOTO_COMBUSTAO";
  return eletrico ? "CARRO_ELETRICO" : "CARRO_COMBUSTAO";
}

/**
 * O tipo que a tela e o CSV usam: o INFORMADO no cadastro (OS 11/11/2026,
 * item 8 — campo `Veiculo.tipo`) quando houver; senão, o deduzido. A dedução
 * erra em casos como a moto elétrica Centry V5 (a marca Centry é de tuk-tuk),
 * e o campo existe exatamente para o RH corrigir esses.
 */
export function tipoDoVeiculo(v: {
  marca: string | null;
  modelo: string | null;
  motorizacao: string;
  tipo?: string | null;
}): TipoVeiculo {
  return ehTipoVeiculo(v.tipo) ? v.tipo : tipoDeduzidoDoVeiculo(v);
}

export function rotuloTipoVeiculo(tipo: TipoVeiculo): string {
  const t = TIPOS_VEICULO.find((x) => x.value === tipo)!;
  return `${t.icone} ${t.label}`;
}
