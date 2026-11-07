// ENDEREÇO PRÓPRIO DO CLIENTE (v1.198.0, Fase 1 da Gestão FASTMAI).
//
// Decisão do CEO em 06/11/2026: cada cliente entra pelo seu endereço
// ("rh.cliente.com.br"), e o mesmo login ("maria") pode existir em clientes
// diferentes. O endereço decide em qual cliente o login é procurado.
//
// O endereço comum (rh.assinelm.com, ou qualquer host sem cliente cadastrado)
// continua funcionando como antes, para os clientes SEM endereço próprio — e
// ali o login precisa ser inequívoco (ver `loginJaUsado`).
//
// Sem "server-only": o smoke roda isto direto contra o Postgres do CI.
import { prisma, type Cliente } from "@/lib/prisma";

/** "RH.Cliente.com.br:443" -> "rh.cliente.com.br". */
export function normalizarHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return h || null;
}

const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * O que o administrador digitou no campo "Endereço", como host válido — aceita
 * colar "https://rh.cliente.com.br/login". `null` = vazio; `false` = inválido.
 */
export function dominioDigitado(texto: string): string | null | false {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const semEsquema = t.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const host = normalizarHost(semEsquema);
  return host && HOST_RE.test(host) ? host : false;
}

/** O cliente dono deste endereço, ou null (endereço comum). */
export async function clientePorHost(host: string | null | undefined, cliente: Cliente = prisma) {
  const h = normalizarHost(host);
  if (!h) return null;
  return cliente.grupo.findUnique({ where: { dominio: h }, select: { id: true, nome: true, ativo: true } });
}

/** O host desta requisição (Request do NextAuth ou cabeçalhos do Next). */
export function hostDosCabecalhos(h: Headers | null | undefined): string | null {
  if (!h) return null;
  return normalizarHost(h.get("x-forwarded-host") ?? h.get("host"));
}

/** URL base para links de e-mail deste cliente: o endereço dele, ou o comum. */
export async function urlBaseDoCliente(grupoId: string | null | undefined, cliente: Cliente = prisma): Promise<string> {
  const comum = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  if (!grupoId) return comum;
  const g = await cliente.grupo.findUnique({ where: { id: grupoId }, select: { dominio: true } });
  return g?.dominio ? `https://${g.dominio}` : comum;
}

/**
 * Onde procurar o login nesta requisição, e o endereço para os links: o
 * endereço próprio de um cliente, ou o comum. Cliente desativado responde
 * como "nenhuma conta" (não aceita login nem recuperação).
 */
export async function ondeDestaRequisicao(h: Headers | null | undefined, cliente: Cliente = prisma) {
  const host = hostDosCabecalhos(h);
  const dono = await clientePorHost(host, cliente);
  const comum = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  if (!dono) return { onde: "comum" as const, baseUrl: comum, bloqueado: false };
  return { onde: { grupoId: dono.id }, baseUrl: `https://${host}`, bloqueado: !dono.ativo };
}
