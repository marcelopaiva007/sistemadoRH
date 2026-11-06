// Regras do NOME DE USUÁRIO — o único jeito de entrar no sistema desde a
// v1.191.0 (decisão do CEO em 05/11/2026).
//
// O desenho: cada usuário pertence a UM grupo (a LM Telecom ou as demais
// marcas). Quem trabalha nos dois tem DOIS usuários — por exemplo "marcelo" e
// "marcelo.lm" —, e pode usar a mesma senha nos dois. Por isso o usuário não
// se repete NUNCA, nem com maiúsculas diferentes: é ele, sozinho, que diz em
// qual conta (e em qual grupo) a pessoa está entrando. O e-mail virou contato
// e pode repetir entre os usuários da mesma pessoa.
//
// POR QUE ARQUIVO SEPARADO: lib/actions/usuarios.ts é "use server", e lá toda
// função exportada vira endpoint. Aqui são funções puras, sem banco — quem
// consulta se o usuário já existe é a action (`loginJaUsado`).
//
// As regras valem para usuário NOVO e para usuário que MUDA de nome. Usuário
// antigo fora do padrão (com maiúscula, por exemplo) continua entrando: a
// edição só cobra a regra quando o próprio nome de usuário é alterado.

export const LOGIN_MIN = 3;
export const LOGIN_MAX = 40;

/**
 * Prefixo dos acessos de portal (lib/delegacoes/acesso-colaborador.ts,
 * `usernameDoPortal`): funcionário sem login, que nunca digita usuário.
 * Ninguém cria um usuário humano com ele.
 */
export const PREFIXO_DO_PORTAL = "colaborador.";

/** Como o usuário é gravado: sem espaços nas pontas e em minúsculas. */
export function normalizarLogin(texto: string): string {
  return texto.trim().toLowerCase();
}

/**
 * O que há de errado com este usuário (já normalizado), ou `null` se ele
 * serve. A mensagem vai direto para a tela de cadastro.
 */
export function problemaNoLogin(login: string): string | null {
  if (!login) return "Informe o usuário de login.";
  if (login.includes("@")) {
    return "O usuário não pode ter “@”: o acesso é pelo nome de usuário, não pelo e-mail. Ex.: “marcelo” ou “marcelo.lm”.";
  }
  if (/\s/.test(login)) return "O usuário não pode ter espaços. Use ponto: “marcelo.paiva”.";
  if (login.length < LOGIN_MIN) return `O usuário precisa ter pelo menos ${LOGIN_MIN} caracteres.`;
  if (login.length > LOGIN_MAX) return `O usuário pode ter no máximo ${LOGIN_MAX} caracteres.`;
  if (!/^[a-z0-9._-]+$/.test(login)) {
    return "Use só letras sem acento, números, ponto, hífen ou sublinhado no usuário.";
  }
  if (!/^[a-z0-9]/.test(login) || !/[a-z0-9]$/.test(login)) {
    return "O usuário precisa começar e terminar com letra ou número.";
  }
  if (login.startsWith(PREFIXO_DO_PORTAL)) {
    return "Usuários começados por “colaborador.” são reservados aos acessos do portal.";
  }
  return null;
}

/**
 * O sufixo que identifica o grupo no nome de usuário: "lm" para o grupo da
 * LM Telecom (com ou sem o "&"), e a primeira palavra do nome para os demais
 * ("Demais marcas" → "demais"). É só a sugestão da tela — o admin escolhe.
 */
export function sufixoDoGrupo(nomeDoGrupo: string | null | undefined): string {
  const palavras = (nomeDoGrupo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (palavras[0] === "lm" || (palavras[0] === "l" && palavras[1] === "m")) return "lm";
  // "Grupo X": a palavra que importa é a segunda.
  const principal = palavras[0] === "grupo" && palavras[1] ? palavras[1] : palavras[0];
  return (principal ?? "grupo").slice(0, 12);
}

/**
 * Candidatos de usuário para a MESMA pessoa em outro grupo, na ordem em que a
 * tela sugere: "marcelo" no grupo LM → "marcelo.lm", "marcelo.lm2"... A action
 * fica com o primeiro que ainda não existe.
 */
export function candidatosDeLogin(login: string, nomeDoGrupo: string | null | undefined): string[] {
  const sufixo = sufixoDoGrupo(nomeDoGrupo);
  const base = login.endsWith(`.${sufixo}`) ? login : `${login}.${sufixo}`;
  const candidatos = [base, ...[2, 3, 4, 5].map((n) => `${base}${n}`)];
  return candidatos.filter((c) => c.length <= LOGIN_MAX && problemaNoLogin(c) === null);
}
