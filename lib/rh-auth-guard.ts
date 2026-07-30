import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";

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
