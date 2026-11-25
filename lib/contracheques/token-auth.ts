// Segurança e autenticação da página de assinatura de contracheques (/assinar/[token]).
//
// Regras essenciais:
// 1. O token do link é de alta entropia (256 bits), gerado uma única vez no envio.
// 2. O código de 6 dígitos nunca é gravado em texto puro: apenas o hash SHA-256.
// 3. O código expira estritamente após 10 minutos.
// 4. Limite de 5 tentativas incorretas (seja de CPF ou código) bloqueia o link.
// 5. Sessão de leitura/assinatura usa assinatura HMAC inviolável após validação do CPF.
// 6. O link vale DIAS_VALIDADE_LINK_ASSINATURA dias a partir do último envio.

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

/**
 * Prazo de vida do link de assinatura, contado do último envio pelo RH (cada
 * reenvio grava `enviadoEm` de novo). Passou disso, o link não abre mais.
 */
export const DIAS_VALIDADE_LINK_ASSINATURA = 120;

export const ERRO_LINK_ASSINATURA_EXPIRADO =
  "Este link de assinatura expirou. Peça ao RH da sua empresa para reenviar o contracheque e use o link novo.";

/**
 * O link ainda está no prazo? A referência é o último envio (`enviadoEm`) e,
 * sem envio registrado, a criação do recibo.
 *
 * 25/11/2026: o token nunca expirava. Um e-mail antigo esquecido numa caixa
 * compartilhada continuava abrindo a assinatura anos depois.
 */
export function linkAssinaturaNoPrazo(
  recibo: { enviadoEm: Date | null; createdAt: Date },
  agora = new Date(),
): boolean {
  const base = recibo.enviadoEm ?? recibo.createdAt;
  return agora.getTime() - base.getTime() <= DIAS_VALIDADE_LINK_ASSINATURA * 24 * 60 * 60 * 1000;
}

/** Rótulo de separação de domínio: a chave derivada do AUTH_SECRET só serve aqui. */
const ROTULO_CHAVE_SESSAO = "fastmai/contracheque-assinatura/cookie-sessao/v1";

/**
 * Chave do HMAC do cookie de sessão da assinatura.
 *
 * 25/11/2026: antes caía para o CRON_SECRET e, sem ele, para um texto fixo no
 * código — quem lesse o repositório forjava o cookie de qualquer link. Em
 * produção não existe SESSION_SECRET, só AUTH_SECRET e CRON_SECRET. Agora:
 * SESSION_SECRET se existir; senão uma chave derivada do AUTH_SECRET por HMAC
 * com rótulo próprio (o AUTH_SECRET cru nunca assina nada aqui); sem nenhum
 * dos dois, erro — falha fechada, nunca um segredo de reserva. Trocar a chave
 * só derruba cookies de assinatura abertos (vida de 1h).
 */
function segredoPadrao(): string {
  const sessao = process.env.SESSION_SECRET;
  if (sessao) return sessao;
  const auth = process.env.AUTH_SECRET;
  if (auth) return createHmac("sha256", auth).update(ROTULO_CHAVE_SESSAO).digest("base64url");
  throw new Error(
    "SESSION_SECRET e AUTH_SECRET ausentes — sem eles a sessão da assinatura de contracheque não pode ser assinada.",
  );
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
