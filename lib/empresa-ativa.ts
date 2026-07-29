// Helpers para o cookie `rh_empresa_ativa` — UI state, não credencial.
// Lives in cookie (não no JWT) porque trocar de empresa não invalida o token
// (o JWT só precisa ter `empresas[]`); assim o cookie vira só um ponteiro.
//
// Conteúdo: JSON `{ empresaId: string, i?: number }`.
// Setor ativo em cookie separado `rh_setor_ativo` (GESTOR_SETOR pode ter
// vários setores entre as várias empresas).
//
// IMPORTANTE: este módulo é importado tanto de runtime Node (auth.ts,
// server actions) quanto do bundle do middleware (proxy.ts) via
// auth.config. Se o import estático de `@/lib/prisma` ficar aqui, o bundler
// inclui o adapter Prisma no bundle Edge — e o build da Vercel quebra.
// Por isso `resolverEmpresaAtiva` carrega o Prisma dinamicamente, só quando
// chamada.
import { cookies } from "next/headers";

const COOKIE_EMPRESA = "rh_empresa_ativa";
const COOKIE_SETOR = "rh_setor_ativo";

type CookieEmpresa = { empresaId: string; i?: number };
type CookieSetor = { setorId: string; i?: number };

export async function lerCookieEmpresaAtiva(): Promise<CookieEmpresa | null> {
  const raw = (await cookies()).get(COOKIE_EMPRESA)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as CookieEmpresa;
    if (typeof parsed?.empresaId !== "string" || !parsed.empresaId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function escreverCookieEmpresaAtiva(empresaId: string): Promise<void> {
  const jar = await cookies();
  const value = encodeURIComponent(JSON.stringify({ empresaId, i: Date.now() }));
  jar.set(COOKIE_EMPRESA, value, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 60 dias — maior que o ciclo normal de trabalho. UI chama de novo a cada
    // troca, então o cookie só "expira" quando o user ficar 60 dias sem entrar.
    maxAge: 60 * 24 * 60 * 60,
  });
}

export async function escreverCookieSetorAtivo(setorId: string | null): Promise<void> {
  const jar = await cookies();
  if (!setorId) {
    jar.delete(COOKIE_SETOR);
    return;
  }
  const value = encodeURIComponent(JSON.stringify({ setorId, i: Date.now() } satisfies CookieSetor));
  jar.set(COOKIE_SETOR, value, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 24 * 60 * 60,
  });
}

// Resolve qual empresa cair no `empresaAtivaId` do JWT. Ordem:
//   1. Cookie, se apontar para uma empresa onde o user tem UserEmpresa ativo.
//   2. UserEmpresa com papelPrincipal=true.
//   3. Primeira UserEmpresa ativa.
//   4. null (ADMIN/DIRETORIA sem empresa específica).
//
// Import dinâmico: este módulo pode ser importado em Edge bundle, e o
// adapter Prisma não funciona lá. Quem chamar `resolverEmpresaAtiva` tem que
// estar em runtime Node (auth.ts, server actions).
export async function resolverEmpresaAtiva(
  userId: string,
  cookie: CookieEmpresa | null,
): Promise<{ empresaId: string; setorId: string | null } | null> {
  const { prisma } = await import("@/lib/prisma");
  const vinculos = await prisma.userEmpresa.findMany({
    where: { userId, ativo: true },
    orderBy: [{ papelPrincipal: "desc" }, { createdAt: "asc" }],
    select: { empresaId: true, setorId: true, papelPrincipal: true },
  });
  if (vinculos.length === 0) return null;

  if (cookie) {
    const match = vinculos.find((v) => v.empresaId === cookie.empresaId);
    if (match) return { empresaId: match.empresaId, setorId: match.setorId };
  }

  const principal = vinculos.find((v) => v.papelPrincipal) ?? vinculos[0];
  return { empresaId: principal.empresaId, setorId: principal.setorId };
}