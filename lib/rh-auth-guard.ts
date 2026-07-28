import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";

const RH_ROLES = ["ADMIN", "RH_MANAGER", "GESTOR_SETOR"] as const;

export async function requireRHAccess() {
  const user = await requireUser();
  if (!RH_ROLES.includes(user.role as (typeof RH_ROLES)[number])) redirect("/");
  return user;
}

// ADMIN acessa qualquer empresa; RH_MANAGER só as vinculadas a ele (uma ou
// mais — user.empresaIds); demais papéis não têm acesso a telas escopadas por
// empresa (ex: GESTOR_SETOR usa /rh/meu-setor).
export async function requireEmpresaAccess(empresaId: string) {
  const user = await requireRHAccess();
  if (user.role === "ADMIN") return user;
  if (user.role === "RH_MANAGER" && user.empresaIds?.includes(empresaId)) return user;
  redirect(user.role === "GESTOR_SETOR" ? "/rh/meu-setor" : "/rh");
}

export async function requireGestorSetor() {
  const user = await requireUser();
  if (user.role !== "GESTOR_SETOR" || !user.empresaId || !user.setorId) redirect("/");
  return user as typeof user & { empresaId: string; setorId: string };
}
