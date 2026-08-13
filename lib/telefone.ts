// Comparação de telefone — a regra dos últimos 8 dígitos, num lugar só.
//
// O mesmo número aparece na base em pelo menos quatro formatos: "83981456383",
// "(83) 98145-6383", "+55 83 98145-6383" e o que o Telegram devolve quando a
// pessoa compartilha o contato ("5583981456383"). Comparar string com string
// diz que são quatro pessoas diferentes.
//
// Os últimos 8 dígitos são a parte que não muda: sobrevivem ao +55, ao DDD e ao
// nono dígito. É por eles que o bot do Telegram acha a ficha de quem
// compartilhou o contato, que a tela de Colaboradores aponta prováveis
// duplicatas e que a busca encontra a ficha por telefone. Os três precisam
// concordar — quando não concordavam, a lista dizia "nenhuma duplicata" para
// duas fichas que o bot considerava a mesma pessoa.

/** Dígitos de um valor qualquer (nulo, formatado, com +55). */
export function digitosDe(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Os últimos 8 dígitos, ou `null` quando não há 8 — número truncado no
 * cadastro ("8398" de quem parou de digitar) não casa com ninguém, em vez de
 * casar com todo mundo cujo telefone termina naqueles 4 dígitos.
 */
export function sufixoTelefone(valor: string | null | undefined): string | null {
  const d = digitosDe(valor);
  return d.length >= 8 ? d.slice(-8) : null;
}

/**
 * O telefone da ficha casa com o que foi digitado na busca?
 *
 * Termo com 8 dígitos ou mais é número inteiro: compara pelo sufixo, então
 * "83981456383" acha a ficha gravada como "(83) 98145-6383". Termo mais curto é
 * pedaço de número — vale `includes`, para quem lembra só do final.
 */
export function telefoneCasaBusca(telefone: string | null | undefined, termoDigitos: string): boolean {
  const d = digitosDe(telefone);
  if (!d || !termoDigitos) return false;
  if (termoDigitos.length >= 8) {
    const sufixo = sufixoTelefone(telefone);
    return sufixo !== null && sufixo === termoDigitos.slice(-8);
  }
  return d.includes(termoDigitos);
}
