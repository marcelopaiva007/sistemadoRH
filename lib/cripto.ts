import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifra simétrica para credenciais guardadas no banco (ver SegredoApp).
 *
 * A chave de cifra é derivada do AUTH_SECRET, que vive só no ambiente e nunca
 * no banco. É isso que separa "credencial guardada" de "credencial exposta":
 * quem levar um dump do Postgres — o backup diário incluído — leva texto
 * cifrado e não tem com o que abrir.
 *
 * O preço: trocar o AUTH_SECRET torna ilegível tudo que foi cifrado com o
 * anterior. Não é perda de dado real (a credencial existe do lado de quem a
 * emitiu), mas exige recadastrar pela tela.
 */
const SAL = "sistemadoRH:segredos:v1";

function chaveDeCifra(): Buffer {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo) {
    throw new Error("AUTH_SECRET ausente — sem ele não há como cifrar nem decifrar credenciais.");
  }
  return scryptSync(segredo, SAL, 32);
}

/** Devolve `iv.tag.dados`, tudo em base64. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", chaveDeCifra(), iv);
  const dados = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [
    iv.toString("base64"),
    cifrador.getAuthTag().toString("base64"),
    dados.toString("base64"),
  ].join(".");
}

/**
 * `null` quando o pacote está corrompido, truncado ou foi cifrado com outro
 * AUTH_SECRET. Devolver null em vez de estourar deixa a tela pedir a
 * credencial de novo, que é a única saída possível nesse caso.
 */
export function decifrar(pacote: string): string | null {
  try {
    const [iv, tag, dados] = pacote.split(".");
    if (!iv || !tag || !dados) return null;
    const decifrador = createDecipheriv("aes-256-gcm", chaveDeCifra(), Buffer.from(iv, "base64"));
    decifrador.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decifrador.update(Buffer.from(dados, "base64")),
      decifrador.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Só o fim da credencial, para a tela dizer QUAL está gravada sem mostrá-la. */
export function dicaDe(texto: string): string {
  return `…${texto.slice(-4)}`;
}
