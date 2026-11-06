// Qual conta a pessoa quis dizer com o que digitou — usado pelo login
// (auth.ts), pelo "Esqueci minha senha" e pelo "Esqueci meu usuário"
// (lib/actions/recuperacao-senha.ts).
//
// DESDE A v1.191.0 O ACESSO É SÓ PELO NOME DE USUÁRIO (decisão do CEO em
// 05/11/2026). Cada usuário pertence a UM grupo — a LM Telecom ou as demais
// marcas —, e quem trabalha nos dois tem dois usuários (ex.: "marcelo" e
// "marcelo.lm"), podendo usar a mesma senha. O e-mail deixou de identificar a
// conta: virou contato, pode repetir entre os usuários da mesma pessoa e só
// serve para avisos e para RECEBER os links de recuperação.
//
// Histórico, que explica a comparação sem maiúsculas: em 30/10/2026 o login
// passou a aceitar usuário ou e-mail sem diferença de maiúsculas (v1.181.1),
// e a recuperação de senha continuou procurando com outra regra — quem foi
// cadastrado como "Fulano@empresa.com" nunca recebia o link. Uma função só,
// para os caminhos nunca mais discordarem.
//
// Sem "server-only": o smoke roda isto direto contra o Postgres do CI.
import { prisma, type Cliente } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

/**
 * O texto é um e-mail? Usuário novo não pode ter "@" (lib/login-usuario.ts),
 * então quem digita e-mail no login quase sempre está usando o jeito antigo —
 * a tela avisa. O login NÃO barra o "@" por isso: algum usuário antigo pode
 * ter "@" no próprio nome de usuário, e ele continua entrando.
 */
export function pareceEmail(texto: string): boolean {
  return texto.includes("@");
}

/**
 * O usuário cujo LOGIN é o texto digitado, sem espaços nas pontas e sem
 * diferença de maiúsculas.
 *
 * O índice único de `username` diferencia maiúsculas, então cadastros antigos
 * podem diferir só nelas: o texto exato vence, e sem exato só vale quando há
 * UM candidato. Na dúvida, ninguém — entrar (ou mandar o link de senha) na
 * conta errada é pior que não entrar. Cadastro novo não repete nem assim
 * (`loginJaUsado`).
 */
export async function usuarioPorLogin(digitado: string, cliente: Cliente = prisma) {
  const texto = digitado.trim();
  if (!texto) return null;
  // Só o campo `username`. O e-mail não entra mais: "fulano@empresa.com" só
  // acharia uma conta cujo NOME DE USUÁRIO fosse literalmente esse texto.
  const exato = await cliente.user.findFirst({ where: { username: texto } });
  if (exato) return exato;
  // O `equals` com `mode: "insensitive"` do Prisma vira ILIKE no Postgres, e
  // aí "_" e "%" do texto digitado funcionam como coringa. O banco só
  // pré-filtra; quem decide é a comparação exata (sem maiúsculas) logo abaixo.
  const minusculo = texto.toLowerCase();
  const parecidos = (
    await cliente.user.findMany({
      where: { username: { equals: texto, mode: "insensitive" } },
      take: 50,
    })
  ).filter((u) => u.username.toLowerCase() === minusculo);
  return parecidos.length === 1 ? parecidos[0] : null;
}

/**
 * As contas ATIVAS com este e-mail de contato — para o "Esqueci meu usuário".
 * Pode haver mais de uma: é justamente a pessoa com um usuário por grupo.
 * Acesso de portal (colaborador sem login) fica de fora: não tem usuário que
 * se use na tela de login.
 */
export async function usuariosPorEmail(digitado: string, cliente: Cliente = prisma) {
  const texto = digitado.trim();
  if (!texto || !pareceEmail(texto)) return [];
  const minusculo = texto.toLowerCase();
  return (
    await cliente.user.findMany({
      where: {
        email: { equals: texto, mode: "insensitive" },
        ativo: true,
        role: { not: PAPEL_PORTAL },
      },
      select: { id: true, nome: true, username: true, email: true, role: true, grupo: { select: { nome: true } } },
      orderBy: { username: "asc" },
      take: 20,
    })
  ).filter((u) => (u.email ?? "").toLowerCase() === minusculo);
}

/**
 * O login já existe, sem diferença de maiúsculas? (Ignora a própria conta, na
 * edição.) Comparação exata em SQL (`lower`), sem ILIKE: "ana_souza" não pode
 * bater com "ana.souza".
 */
export async function loginJaUsado(
  username: string,
  excetoId?: string,
  cliente: Cliente = prisma,
): Promise<{ id: string; username: string; grupoId: string | null; grupoNome: string | null } | null> {
  const texto = username.trim();
  if (!texto) return null;
  const achados = await cliente.$queryRaw<
    { id: string; username: string; grupoId: string | null; grupoNome: string | null }[]
  >`
    SELECT u.id, u.username, u."grupoId", g.nome AS "grupoNome"
    FROM "rh"."User" u
    LEFT JOIN "rh"."Grupo" g ON g.id = u."grupoId"
    WHERE lower(u.username) = lower(${texto})
      AND (${excetoId ?? null}::text IS NULL OR u.id <> ${excetoId ?? null}::text)
    LIMIT 1`;
  return achados[0] ?? null;
}
