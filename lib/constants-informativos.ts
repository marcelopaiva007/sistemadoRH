// Constantes dos Informativos do RH — separadas de lib/informativos.ts porque
// a tela (Client Component) usa estas e aquele arquivo fala com banco,
// Telegram e SMTP, que não podem ir para o navegador.

export const MAXIMO_TITULO = 120;
// O Telegram corta mensagem em 4096 caracteres. Sobra folga para saudação,
// título e assinatura — passar disso a mensagem simplesmente não sai.
export const MAXIMO_MENSAGEM = 3500;

/** Os quatro jeitos de escolher o público, do mais largo ao mais estreito. */
export const MODOS_PUBLICO = ["TODOS", "EMPRESAS", "SETORES", "PESSOAS"] as const;
export type ModoPublico = (typeof MODOS_PUBLICO)[number];
