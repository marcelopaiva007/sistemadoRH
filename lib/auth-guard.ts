import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { direcaoRestrita } from "@/lib/grupo";

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
//
// MASTER também entra (v1.186.0): é ele quem cria as contas de cada grupo. O
// recorte de QUAIS contas cada um alcança mora nas actions (lib/actions/
// usuarios.ts, `escopoGestao`) e na tela — ver lib/grupo.ts.
//
// ADMIN ou DIRETORIA PRESO A ALGUMAS MARCAS (tela de admin — ver
// `direcaoRestrita` em lib/grupo.ts) NÃO entra: gerir contas é poder sobre o
// grupo inteiro, e bastaria criar uma conta de Diretoria nova ou desmarcar a
// própria restrição para voltar a ver todas as marcas.
export async function requireGestaoUsuarios() {
  const user = await requireDirecaoOuMaster();
  if (await direcaoRestrita(user)) redirect("/");
  return user;
}

// ADMIN, DIRETORIA (restrita ou não) e MASTER — para telas que não dão poder
// sobre o grupo, como o histórico de Atualizações.
export async function requireDirecaoOuMaster() {
  const user = await requireUser();
  if (
    user.role !== "ADMIN" &&
    user.role !== "DIRETORIA" &&
    user.role !== "MASTER"
  )
    redirect("/");
  return user;
}
