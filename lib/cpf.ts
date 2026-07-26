/**
 * CPF: dígitos verificadores e normalização.
 *
 * Mesmo critério do CNPJ (lib/cnpj.ts): guardar só os 11 dígitos; máscara é
 * responsabilidade da tela. Extraído da inscrição pública de vagas quando o
 * importador de planilhas passou a precisar da mesma conta — uma implementação
 * só, para os dois nunca discordarem sobre o que é um CPF válido.
 */

export function apenasDigitosCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitosCpf(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const [comprimento, posicaoDigito] of [
    [9, 9],
    [10, 10],
  ]) {
    let soma = 0;
    for (let i = 0; i < comprimento; i++) soma += Number(cpf[i]) * (comprimento + 1 - i);
    const resto = ((soma * 10) % 11) % 10;
    if (resto !== Number(cpf[posicaoDigito])) return false;
  }
  return true;
}
