import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

// Gestão de usuários: ADMIN e DIRETORIA, por decisão do dono do sistema em
// 31/07/2026. Vale dizer o que isso significa — quem cria usuário concede
// acesso, e como não há restrição de papel, a diretoria pode criar um ADMIN e
// com isso se promover. A separação entre os dois papéis, aqui, é de
// organização e não de segurança.
//
// Guarda própria e não `requireAdmin` alargado de propósito: o CRUD de
// empresas (lib/actions/rh-empresas.ts) continua exclusivo do ADMIN.
export async function requireGestaoUsuarios() {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "DIRETORIA") redirect("/");
  return user;
}
