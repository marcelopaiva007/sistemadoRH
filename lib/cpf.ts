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

/** 12345678901 → 123.456.789-01. Devolve "—" se não houver 11 dígitos. */
export function formatarCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = apenasDigitosCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * 12345678901 → ***.456.789-**
 *
 * Esconde os quatro dígitos que mais identificam (o início e os
 * verificadores), preservando o miolo — o suficiente para conferir contra um
 * documento em mãos, insuficiente para anotar o CPF de alguém.
 *
 * É a forma PADRÃO de mostrar CPF em lista neste sistema. A tela que precisa
 * do número inteiro deve revelar por gesto explícito de quem tem permissão,
 * nunca por padrão: uma listagem aberta expõe centenas de CPFs de uma vez a
 * quem só queria achar uma pessoa.
 */
export function mascararCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = apenasDigitosCpf(cpf);
  if (d.length !== 11) return "—";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
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
