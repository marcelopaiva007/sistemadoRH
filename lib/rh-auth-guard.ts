import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

const RH_ROLES = ["ADMIN", "RH_MANAGER", "GESTOR_SETOR"] as const;

export async function requireRHAccess() {
  const user = await requireUser();
  if (!RH_ROLES.includes(user.role as (typeof RH_ROLES)[number])) redirect("/");
  return user;
}

// ADMIN acessa qualquer empresa. RH_MANAGER/GESTOR_SETOR precisam ter uma
// UserEmpresa ativa apontando para a empresaId solicitada. ADMIN e DIRETORIA
// também podem acessar — ADMIN livre, DIRETORIA só para consulta (read-only
// no módulo RH).
export async function requireEmpresaAccess(empresaId: string) {
  const user = await requireRHAccess();
  if (user.role === "ADMIN") return user;
  const temAcesso = user.empresas.some(
    (e) => e.empresaId === empresaId && e.ativo && (e.papel === "RH_MANAGER" || e.papel === "GESTOR_SETOR"),
  );
  if (temAcesso) return user;
  redirect(user.role === "GESTOR_SETOR" ? "/rh/meu-setor" : "/rh");
}

// Empresas que o usuário enxerga no módulo de RH — a base do filtro por
// marca/CNPJ, que consolida tudo por padrão.
//
// ADMIN e DIRETORIA têm papel GLOBAL: o pivô UserEmpresa fica vazio para eles.
// Montar a lista a partir do pivô devolveria lista nenhuma — e uma tela que
// depende dela some, ou responde 404 achando que a empresa não existe.
export async function empresasVisiveis(user: {
  role: string;
  empresas: { empresaId: string; ativo: boolean }[];
}): Promise<string[]> {
  if (user.role === "ADMIN" || user.role === "DIRETORIA") {
    const todas = await prisma.empresa.findMany({
      where: { ativo: true },
      select: { id: true },
    });
    return todas.map((e) => e.id);
  }
  return user.empresas.filter((e) => e.ativo).map((e) => e.empresaId);
}

// GESTOR_SETOR com empresa ativa + setor ativo no JWT. Se faltarem (cookie
// expirado, pivô desativado), manda pra home — UI de troca fica na Fase 7.
export async function requireGestorSetor() {
  const user = await requireUser();
  if (
    user.role !== "GESTOR_SETOR" ||
    !user.empresaAtivaId ||
    !user.setorAtivaId ||
    !user.empresas.some((e) => e.empresaId === user.empresaAtivaId && e.ativo)
  ) {
    redirect("/");
  }
  return user as typeof user & { empresaAtivaId: string; setorAtivaId: string };
}
