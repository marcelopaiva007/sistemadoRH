"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ipDaRequisicao } from "@/lib/login-tentativas";
import {
  definirCookieDePonto,
  encerrarSessaoPonto,
  entrarComPin,
} from "@/lib/ponto-pin-auth";

export type ResultadoEntrarNoPonto =
  | { ok: true }
  | { ok: true; escolher: Array<{ colaboradorId: string; empresa: string }> }
  | { ok: false; erro: string };

export async function entrarNoPonto(input: {
  cpf: string;
  pin: string;
  colaboradorId?: string;
}): Promise<ResultadoEntrarNoPonto> {
  const ip = ipDaRequisicao(await headers());
  const resultado = await entrarComPin(input.cpf, input.pin, ip, input.colaboradorId);

  if (!resultado.ok) return resultado;
  if ("escolher" in resultado) return { ok: true, escolher: resultado.escolher };

  await definirCookieDePonto(resultado.sessaoToken, resultado.expiraEm);
  revalidatePath("/ponto");
  return { ok: true };
}

export async function sairDoPonto(): Promise<void> {
  await encerrarSessaoPonto();
  revalidatePath("/ponto");
}
