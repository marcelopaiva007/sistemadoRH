// Segurança e autenticação da página de assinatura de contracheques (/assinar/[token]).
//
// Regras essenciais:
// 1. O token do link é de alta entropia (256 bits), gerado uma única vez no envio.
// 2. O código de 6 dígitos nunca é gravado em texto puro: apenas o hash SHA-256.
// 3. O código expira estritamente após 10 minutos.
// 4. Limite de 5 tentativas incorretas (seja de CPF ou código) bloqueia o link.
// 5. Sessão de leitura/assinatura usa assinatura HMAC inviolável após validação do 2FA.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const MAXIMO_TENTATIVAS_ERRO = 5;
export const MINUTOS_VALIDADE_CODIGO = 10;

/** Gera um token seguro e opaco para o link único de assinatura. */
export function gerarTokenAssinatura(): string {
  return randomBytes(32).toString("base64url");
}

/** Gera um código de 6 dígitos numéricos, seu hash SHA-256 e validade de 10 minutos. */
export function gerarCodigo2fa(agora = new Date()): { codigo: string; hash: string; expiraEm: Date } {
  const num = randomInt(100000, 1000000);
  const codigo = String(num);
  const hash = createHash("sha256").update(codigo).digest("hex");
  const expiraEm = new Date(agora.getTime() + MINUTOS_VALIDADE_CODIGO * 60 * 1000);
  return { codigo, hash, expiraEm };
}

/** Valida se o código digitado confere com o hash gravado e se ainda está no prazo. */
export function validarHashCodigo(
  codigoDigitado: string,
  hashEsperado: string,
  expiraEm: Date,
  agora = new Date()
): boolean {
  if (agora.getTime() > expiraEm.getTime()) return false;
  const limpo = codigoDigitado.trim();
  if (!/^\d{6}$/.test(limpo)) return false;

  const hashDigitado = createHash("sha256").update(limpo).digest("hex");
  try {
    const bufDigitado = Buffer.from(hashDigitado, "hex");
    const bufEsperado = Buffer.from(hashEsperado, "hex");
    if (bufDigitado.length !== bufEsperado.length) return false;
    return timingSafeEqual(bufDigitado, bufEsperado);
  } catch {
    return false;
  }
}

/** Extrai apenas os dígitos numéricos do CPF. */
export function normalizarCpf(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}

/** Compara dois CPFs ignorando formatação e pontuação. */
export function compararCpf(cpfInformado: string, cpfCadastrado: string | null | undefined): boolean {
  const a = normalizarCpf(cpfInformado);
  const b = normalizarCpf(cpfCadastrado);
  return a.length === 11 && a === b;
}

function segredoPadrao(): string {
  return process.env.SESSION_SECRET || process.env.CRON_SECRET || "rh-contracheque-sessao-key-928374";
}

/** Gera assinatura HMAC de sessão temporária liberada após 2FA para visualizar o PDF e assinar. */
export function gerarAssinaturaSessao(token: string, segredo = segredoPadrao()): string {
  return createHmac("sha256", segredo).update(`contracheque-sessao:${token}`).digest("base64url");
}

/** Confere se a assinatura HMAC enviada corresponde ao token da URL. */
export function verificarAssinaturaSessao(
  token: string,
  assinatura: string | null | undefined,
  segredo = segredoPadrao()
): boolean {
  if (!assinatura) return false;
  const esperada = gerarAssinaturaSessao(token, segredo);
  try {
    const b1 = Buffer.from(assinatura, "utf-8");
    const b2 = Buffer.from(esperada, "utf-8");
    if (b1.length !== b2.length) return false;
    return timingSafeEqual(b1, b2);
  } catch {
    return false;
  }
}
