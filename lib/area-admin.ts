/**
 * O endereço da área de administração como a pessoa o digitaria
 * ("rh.assinelm.com/admin" em produção). Aparece no menu do nome e na tela
 * Conta de Diretoria e Administrativo — pedido do dono (v1.188.0): quem está
 * logado com a conta do dia a dia não precisa decorar o endereço.
 *
 * Sai da URL pública do sistema (NEXTAUTH_URL), e não do host da requisição:
 * em preview ou local mostra o endereço daquele ambiente, e nunca um host
 * vindo de cabeçalho.
 */
export function enderecoDaAreaAdmin(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "";
  const host = base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host ? `${host}/admin` : "/admin";
}
