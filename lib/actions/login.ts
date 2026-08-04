"use server";

// Por que existe uma action só para isto: o `authorize` do NextAuth só sabe
// dizer "sim" ou "não" — todo `return null` chega no formulário como o mesmo
// `CredentialsSignin`, sem motivo. Sem esta consulta, quem foi bloqueado veria
// "usuário ou senha inválidos" e continuaria digitando a senha certa, achando
// que esqueceu. A tela precisa distinguir os dois casos; o `authorize`, não.
import { headers } from "next/headers";
import { estadoDoLogin, ipDaRequisicao, minutosAteLiberar } from "@/lib/login-tentativas";

export type MotivoDeFalha =
  | { tipo: "credenciais" }
  | { tipo: "bloqueado"; minutos: number };

/**
 * Chamada só depois de um login que já falhou, para saber qual das duas
 * mensagens mostrar.
 *
 * Não vaza existência de usuário: o balde é contado pelo texto digitado, e
 * usuário que não existe acumula falha igual. "está bloqueado" aqui significa
 * "este nome, deste IP, errou vezes demais" — o que quem está tentando já
 * sabe, porque foi ele quem errou.
 */
export async function motivoDaFalhaDeLogin(username: string): Promise<MotivoDeFalha> {
  if (!username) return { tipo: "credenciais" };

  const agora = new Date();
  const ip = ipDaRequisicao(await headers());
  const estado = await estadoDoLogin(username, ip, agora).catch(() => null);

  if (!estado?.bloqueado || !estado.liberaEm) return { tipo: "credenciais" };
  return { tipo: "bloqueado", minutos: minutosAteLiberar(estado.liberaEm, agora) };
}
