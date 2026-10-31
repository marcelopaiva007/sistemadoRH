// Qual conta a pessoa quis dizer com o que digitou — usado pelo login
// (auth.ts) e pelo "Esqueci minha senha" (lib/actions/recuperacao-senha.ts).
//
// Os dois caminhos precisam da MESMA regra. Em 30/10/2026 o login passou a
// aceitar usuário ou e-mail sem diferença de maiúsculas (v1.181.1), e a
// recuperação de senha continuou procurando o e-mail com `findUnique` em
// minúsculas — enquanto o cadastro (lib/actions/usuarios.ts) grava o e-mail
// só com `trim`. Quem foi cadastrado como "Fulano@empresa.com" nunca recebia
// o link, e a tela dizia "enviado" mesmo assim (ela não pode revelar se o
// endereço existe). Uma função só, para os dois nunca mais discordarem.
//
// Sem "server-only": o smoke roda isto direto contra o Postgres do CI.
import { prisma, type Cliente } from "@/lib/prisma";

export type CampoDoIdentificador = "username" | "email";

/** "@" no texto = e-mail; sem "@" = nome de usuário (usuário não tem "@"). */
export function campoDoIdentificador(texto: string): CampoDoIdentificador {
  return texto.includes("@") ? "email" : "username";
}

/**
 * O usuário cujo `username` ou `email` é o texto digitado, sem espaços nas
 * pontas e sem diferença de maiúsculas.
 *
 * Os índices únicos de `username` e `email` diferenciam maiúsculas, então
 * dois cadastros podem diferir só nelas: o texto exato vence, e sem exato só
 * vale quando há UM candidato. Na dúvida, ninguém — entrar (ou mandar o link
 * de senha) na conta errada é pior que não entrar.
 *
 * `campo` força a busca por um campo só: a recuperação de senha é sempre por
 * e-mail, digite a pessoa "@" ou não.
 */
export async function usuarioPorIdentificador(
  digitado: string,
  campo?: CampoDoIdentificador,
  cliente: Cliente = prisma,
) {
  const texto = digitado.trim();
  if (!texto) return null;
  const qual = campo ?? campoDoIdentificador(texto);
  const exato = await cliente.user.findFirst({ where: { [qual]: texto } });
  if (exato) return exato;
  const parecidos = await cliente.user.findMany({
    where: { [qual]: { equals: texto, mode: "insensitive" } },
    take: 2,
  });
  return parecidos.length === 1 ? parecidos[0] : null;
}
