import pacote from "../package.json";

/**
 * Versão exibida na tela de entrada.
 *
 * Serve para uma pergunta prática: "o que estou vendo é a versão nova?".
 * Por isso não basta o número do package.json — ele só muda quando alguém
 * lembra de mudar. O commit vem junto, e esse não mente: é exatamente o
 * código que a Vercel publicou.
 *
 * `VERCEL_GIT_COMMIT_SHA` só existe no servidor da Vercel. Em
 * desenvolvimento não existe, e aí a etiqueta diz "local" — o que é a
 * informação certa nesse caso.
 */
export function versaoDoSistema(): { numero: string; commit: string | null; rotulo: string } {
  const numero = pacote.version;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const commit = sha ? sha.slice(0, 7) : null;
  return {
    numero,
    commit,
    rotulo: commit ? `v${numero} · ${commit}` : `v${numero} · local`,
  };
}
