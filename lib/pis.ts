/**
 * PIS/PASEP/NIT: dígito verificador. Guardado só com os 11 dígitos, como o CPF
 * (lib/cpf.ts).
 *
 * Saiu de lib/actions/portal-cadastro.ts quando a Caixa de documentos passou a
 * usar o PIS impresso no contracheque para achar a pessoa — muitas folhas
 * trazem o PIS e não o CPF. Uma implementação só, para os dois lados nunca
 * discordarem sobre o que é um PIS válido.
 */
export function pisValido(valor: string): boolean {
  if (valor.length !== 11 || /^(\d)\1{10}$/.test(valor)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((acc, peso, i) => acc + Number(valor[i]) * peso, 0);
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(valor[10]);
}
