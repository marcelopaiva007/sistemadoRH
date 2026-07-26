/**
 * CNPJ: validação dos dígitos verificadores e formatação.
 *
 * Guardamos sempre **só os 14 dígitos**, sem máscara. A formatação é
 * responsabilidade da tela — assim a busca, o índice único e a comparação com
 * o que vem de planilha ou de API funcionam sobre a mesma forma. O mesmo
 * critério já usado para o CPF do candidato.
 */

/** Deixa só os dígitos. Aceita entrada com ponto, barra e traço. */
export function apenasDigitosCnpj(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Confere os dois dígitos verificadores.
 *
 * Rejeita também os 14 dígitos repetidos (00000000000000, 11111111111111...):
 * eles passam na conta do módulo 11, mas não são CNPJ de ninguém.
 */
export function cnpjValido(valor: string): boolean {
  const d = apenasDigitosCnpj(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const digito = (base: string): number => {
    // Os pesos correm de 2 a 9, ciclicamente, da direita para a esquerda.
    let soma = 0;
    let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += Number(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = digito(d.slice(0, 12));
  if (primeiro !== Number(d[12])) return false;
  return digito(d.slice(0, 13)) === Number(d[13]);
}

/** 12345678000190 → 12.345.678/0001-90. Devolve o próprio valor se não tiver 14 dígitos. */
export function formatarCnpj(valor: string | null | undefined): string {
  if (!valor) return "";
  const d = apenasDigitosCnpj(valor);
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** As 27 unidades federativas, para o campo de UF não aceitar sigla inventada. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

export function ufValida(uf: string): boolean {
  return (UFS as readonly string[]).includes(uf.toUpperCase());
}
