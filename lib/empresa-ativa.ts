// Helpers para o cookie `rh_empresa_ativa` — UI state, não credencial.
// Lives in cookie (não no JWT) porque trocar de empresa não invalida o token
// (o JWT só precisa ter `empresas[]`); assim o cookie vira só um ponteiro.
//
// Conteúdo: JSON `{ empresaId: string, i?: number }`.
// Setor ativo em cookie separado `rh_setor_ativo` (GESTOR_SETOR pode ter
// vários setores entre as várias empresas).
//
// IMPORTANTE: este arquivo é importado apenas de runtime Node (auth.ts via
// callback jwt e server actions em lib/actions/usuarios.ts). O bundle Edge
// do middleware NÃO inclui este módulo — auth.config.ts não importa nada
// daqui. Os callbacks de auth.config.ts são stubs; a versão completa está em
// auth.ts (Node), onde Prisma está disponível.
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { EmpresaNaSessao, UsuarioParaRevalidar } from "@/lib/sessao-revalidada";

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

// RELEITURA DA SESSÃO — o usuário (ativo, papel, `sessoesValidasDesde`) e os
// vínculos UserEmpresa ativos, numa ida só ao banco. Roda no callback `jwt`
// (auth.ts) a cada `auth()`; a regra de "a sessão ainda vale?" e a escolha da
// empresa ativa moram em lib/sessao-revalidada.ts, sem banco.
//
// Até 25/11/2026 aqui se liam só os vínculos (`vinculosAtivos`, v1.209.0) e o
// resto vinha da cópia gravada no JWT no login — conta desativada ou senha
// trocada seguia valendo até a sessão expirar (30 dias). A consulta passou a
// trazer o usuário junto, por LEFT JOIN, para continuar UMA ida ao banco (o
// `include` do Prisma faria duas: usuário, depois vínculos).
//
// Memorizada POR REQUISIÇÃO (`cache` do React), como a anterior: o NextAuth
// chama o `jwt` a CADA `auth()` — e uma tela chama `auth()` três vezes ou mais
// (layout geral, layout do módulo, página, rotas de auditoria). Com o cache é
// uma consulta por navegação, e a resposta continua vindo do banco de agora.
// Fora de um render do React (rota de API) o `cache` não memoriza e a
// consulta roda uma vez por `auth()`, como sempre rodou.
type LinhaDaSessao = {
  ativo: boolean;
  role: string;
  sessoesValidasDesde: Date | null;
  empresaId: string | null;
  papel: string | null;
  setorId: string | null;
  papelPrincipal: boolean | null;
};

export const dadosDaSessao = cache(async (userId: string): Promise<UsuarioParaRevalidar | null> => {
  const linhas = await prisma.$queryRaw<LinhaDaSessao[]>`
    SELECT u."ativo", u."role", u."sessoesValidasDesde",
           ue."empresaId", ue."role" AS "papel", ue."setorId", ue."papelPrincipal"
      FROM "rh"."User" u
      LEFT JOIN "rh"."UserEmpresa" ue ON ue."userId" = u."id" AND ue."ativo" = true
     WHERE u."id" = ${userId}
     ORDER BY ue."papelPrincipal" DESC NULLS LAST, ue."createdAt" ASC
  `;
  if (linhas.length === 0) return null;
  const [u] = linhas;
  return {
    ativo: u.ativo,
    role: u.role,
    sessoesValidasDesde: u.sessoesValidasDesde,
    empresas: linhas
      .filter((l): l is LinhaDaSessao & { empresaId: string } => l.empresaId !== null)
      .map((l) => ({
        empresaId: l.empresaId,
        papel: l.papel as EmpresaNaSessao["papel"],
        setorId: l.setorId,
        papelPrincipal: l.papelPrincipal === true,
        ativo: true as const,
      })),
  };
});

