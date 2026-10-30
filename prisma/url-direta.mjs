/**
 * A URL que o `prisma migrate deploy` deve usar: a conexão DIRETA do Neon,
 * nunca a do pooler.
 *
 * Em 28/09/2026 os dois deploys de produção da v1.179.1 morreram com P1002
 * ("Timed out trying to acquire a postgres advisory lock") e a produção ficou
 * parada na v1.179.0 por um mês, sem ninguém notar — o site seguia no ar com a
 * versão anterior. O `DATABASE_URL` da Vercel aponta para o host `-pooler`
 * (PgBouncer em modo transação). O `migrate deploy` pega um advisory lock de
 * SESSÃO; pelo pooler, o lock é pego numa conexão do servidor e o unlock pode
 * sair por outra, e o lock fica preso até o pooler reciclar aquela conexão.
 * Bastou a migration da v1.178.2 ter rodado ~30 min antes. Pela conexão
 * direta o lock morre junto com o processo do migrate.
 *
 * Ordem: `DATABASE_URL_DIRECT`, se a Vercel tiver uma; senão o próprio
 * `DATABASE_URL` com o `-pooler` tirado do primeiro rótulo do host (é como o
 * Neon nomeia os dois endpoints do mesmo banco) e sem o `pgbouncer=true`, que
 * só faz sentido no pooler. URL que não é do pooler volta igual.
 *
 * JavaScript puro, como o checador: roda no build da Vercel, sem tsx.
 */
export function urlParaMigrar(env) {
  if (env.DATABASE_URL_DIRECT) return { url: env.DATABASE_URL_DIRECT, origem: "DATABASE_URL_DIRECT" };
  const original = env.DATABASE_URL;
  const direta = semPooler(original);
  return { url: direta, origem: direta === original ? "DATABASE_URL" : "DATABASE_URL sem -pooler" };
}

export function semPooler(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const [primeiro, ...resto] = u.hostname.split(".");
  if (!primeiro.endsWith("-pooler")) return url;
  u.hostname = [primeiro.slice(0, -"-pooler".length), ...resto].join(".");
  u.searchParams.delete("pgbouncer");
  return u.toString();
}
