import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { direcaoRestrita, ehMaster } from "@/lib/grupo";

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

// Gestão de contas (usuários, perfis de acesso, grupos): SÓ o MASTER, na área
// de administração separada do sistema — rh.assinelm.com/admin (app/admin),
// desde a v1.188.0. Decisão do CEO em 05/11/2026: "a tela de usuários sai do
// sistema"; criar, editar e desativar conta passa a ser só do admin.
//
// Até a v1.187.0 ADMIN e DIRETORIA também geriam as contas do próprio grupo
// (decisão de 31/07/2026). O efeito colateral registrado na época era que a
// diretoria podia criar um ADMIN e se promover — e, com a restrição de marcas
// da v1.187.0, que bastaria criar outra conta para escapar dela. Com a gestão
// só no MASTER, as duas portas fecham.
//
// O recorte por grupo continua nas actions (lib/actions/usuarios.ts,
// `escopoGestao`): os ramos de ADMIN/DIRETORIA ficaram lá como defesa, mas
// ninguém além do MASTER passa daqui.
export async function requireGestaoUsuarios() {
  const user = await requireUser();
  if (!ehMaster(user)) redirect("/");
  return user;
}

// ADMIN ou DIRETORIA que enxerga o GRUPO INTEIRO — para painéis do grupo, como
// a Produtividade do RH. Quem foi preso a algumas marcas pela área de admin
// (`direcaoRestrita`, lib/grupo.ts) fica de fora: o painel mostra gente de
// todas as marcas. O MASTER também fica: ele administra, não abre dado de RH.
export async function requireDirecaoDoGrupoInteiro() {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "DIRETORIA") redirect("/");
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
