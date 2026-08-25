// A identificação do colaborador no bot do Telegram — parte pura, testável.
//
// O primeiro vínculo pelo CPF DIGITADO ganhou um segundo fator: a data de
// nascimento. CPF não é segredo (está na ficha, o DP conhece, e o próprio bot
// mandava digitar), então CPF sozinho deixava qualquer pessoa com um Telegram
// ainda não vinculado assumir o portal de um colega antes de ele se cadastrar.
// A data de nascimento é algo que o colega em geral NÃO tem à mão.
//
// O webhook é sem estado (não guarda "estou esperando a data deste chat"), então
// os dois vêm na MESMA mensagem. Uma tabela de estado pendente seria escrita a
// mais no banco por identificação, e o valor não compensa para o caso — 8
// pessoas ainda por vincular.

/** A data de nascimento reconhecida num texto: dia/mês/ano com separador. */
export function extrairData(texto: string): { dia: number; mes: number; ano: number } | null {
  // Aceita 15/03/1990, 15-03-1990, 15.03.1990. Exige separador de propósito:
  // "150390" colado é ambíguo ao lado de um CPF de 11 dígitos no mesmo texto.
  const m = texto.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!m) return null;
  return { dia: Number(m[1]), mes: Number(m[2]), ano: Number(m[3]) };
}

/**
 * Separa CPF e data de nascimento de uma mensagem que traz os dois.
 *
 * A ordem de leitura importa: acha a DATA primeiro (que tem separadores), tira
 * ela do texto, e só então extrai os 11 dígitos do CPF do que sobrou — senão
 * os dígitos da data se misturariam aos do CPF (`digitos("...")`).
 */
export function extrairCpfEData(
  texto: string,
  digitos: (s: string) => string,
): { cpf: string; data: { dia: number; mes: number; ano: number } | null } {
  const data = extrairData(texto);
  const semData = data
    ? texto.replace(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/, " ")
    : texto;
  return { cpf: digitos(semData), data };
}

/**
 * A data digitada bate com a de nascimento da ficha?
 *
 * Compara em UTC — `dataNascimento` vem de um input de data e é gravada à
 * meia-noite UTC; ler com `getUTC*` evita o deslize de um dia que o fuso do
 * servidor (UTC na Vercel) causaria com `getDate()` local.
 */
export function conferirNascimento(
  nascimento: Date | null,
  data: { dia: number; mes: number; ano: number } | null,
): boolean {
  if (!nascimento || !data) return false;
  return (
    nascimento.getUTCFullYear() === data.ano &&
    nascimento.getUTCMonth() + 1 === data.mes &&
    nascimento.getUTCDate() === data.dia
  );
}
