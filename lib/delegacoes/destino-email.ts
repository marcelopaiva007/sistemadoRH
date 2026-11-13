import { BOT_DO_RH } from "@/lib/bot-do-rh";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

// PARA ONDE VAI O E-MAIL DE UMA PESSOA NAS DELEGAÇÕES.
//
// Pedido da Direção em 13/11/2026: "nas delegações, envio pelo Telegram e
// pelo e-mail também". O e-mail já era tentado desde 29/08/2026, mas lia SÓ
// `User.email` — e quase ninguém que recebe demanda tem e-mail no login:
//   - o acesso de portal nasce com e-mail NULO de propósito (trava de
//     segurança, ver lib/delegacoes/acesso-colaborador.ts);
//   - desde 05/11/2026 o login do sistema é só usuário e senha.
// Resultado: o e-mail falhava calado para praticamente todo colaborador.
//
// A regra agora: e-mail do login quando houver; senão, o e-mail da FICHA do
// colaborador (`Colaborador.email`, o mesmo que o RH já usa para convite de
// pesquisa e contracheque). Ler o e-mail da ficha para AVISAR não mexe na
// trava: o `User` de portal continua sem e-mail, e "esqueci minha senha"
// continua sem para onde mandar link.

export type PessoaComEmail = {
  email: string | null;
  role?: string | null;
  colaborador?: { email?: string | null } | null;
};

function limpo(e: string | null | undefined): string | null {
  const s = e?.trim().toLowerCase();
  return s ? s : null;
}

/** O endereço que recebe os avisos desta pessoa, ou null se não há nenhum. */
export function emailDe(p: PessoaComEmail): string | null {
  return limpo(p.email) ?? limpo(p.colaborador?.email);
}

/**
 * Acesso de portal não tem senha — um link para /delegacoes/<id> cairia numa
 * tela de login que ele não consegue passar. Para essa pessoa o e-mail ensina
 * o caminho que funciona (o bot), em vez de mandar um link morto. Não vai
 * link de entrada do portal no e-mail: aquele token é de uso único e vida
 * curta, pensado para trafegar só dentro do chat do Telegram já vinculado.
 */
export function comoAbrir(
  p: { role?: string | null },
  linkDemanda: string,
): { texto: string; html: string } {
  if (p.role === PAPEL_PORTAL) {
    const t = `Para aceitar, responder ou entregar: no Telegram, abra ${BOT_DO_RH} e envie /portal.`;
    return { texto: t, html: `<p>${t}</p>` };
  }
  return {
    texto: `Abrir: ${linkDemanda}`,
    html: `<p><a href="${linkDemanda}">Abrir no sistema</a></p>`,
  };
}
