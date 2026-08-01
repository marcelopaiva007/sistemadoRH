import { prisma } from "@/lib/prisma";
import { decifrar } from "@/lib/cripto";

export const CHAVE_ANTHROPIC = "ANTHROPIC_API_KEY";

export type OrigemSegredo = "ambiente" | "sistema";

export type StatusSegredo = {
  ligado: boolean;
  origem: OrigemSegredo | null;
  dica: string | null;
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

/**
 * A credencial em claro, para uso no servidor. Nunca devolva isto ao cliente.
 *
 * O ambiente tem precedência sobre o banco de propósito: uma variável definida
 * na Vercel é o canal mais restrito dos dois, e quem já configurou lá não deve
 * ver o comportamento mudar por causa de um cadastro feito na tela. A tela
 * avisa quando isso acontece, para ninguém salvar uma chave nova e ficar sem
 * entender por que a antiga continua valendo.
 */
export async function segredo(nome: string): Promise<string | null> {
  const doAmbiente = process.env[nome];
  if (doAmbiente) return doAmbiente;

  const linha = await prisma.segredoApp.findUnique({
    where: { chave: nome },
    select: { valor: true },
  });
  if (!linha) return null;
  return decifrar(linha.valor);
}

/** O que a tela pode saber: se está ligado, de onde vem e os 4 últimos dígitos. */
export async function statusDoSegredo(nome: string): Promise<StatusSegredo> {
  const linha = await prisma.segredoApp.findUnique({
    where: { chave: nome },
    select: { dica: true, atualizadoEm: true, atualizadoPor: true },
  });

  if (process.env[nome]) {
    return {
      ligado: true,
      origem: "ambiente",
      dica: linha?.dica ?? null,
      atualizadoEm: linha?.atualizadoEm ?? null,
      atualizadoPor: linha?.atualizadoPor ?? null,
    };
  }

  if (!linha) {
    return { ligado: false, origem: null, dica: null, atualizadoEm: null, atualizadoPor: null };
  }

  return {
    ligado: true,
    origem: "sistema",
    dica: linha.dica,
    atualizadoEm: linha.atualizadoEm,
    atualizadoPor: linha.atualizadoPor,
  };
}
