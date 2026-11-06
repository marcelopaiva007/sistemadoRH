import { redirect } from "next/navigation";

// Esta tela documentava os quatro papéis fixos (ADMIN/DIRETORIA/RH_MANAGER/
// GESTOR_SETOR) — o sistema de acesso ANTIGO. Desde 26/08/2026 o cadastro de
// acesso é único e dos dois sistemas, e é a matriz do perfil que diz o que
// cada um vê e edita, por tela. Desde a v1.188.0 usuários e perfis moram na
// área de administração (app/admin, só da conta MASTER). A rota fica de pé só
// para link antigo não quebrar.
export default function PapeisPage() {
  redirect("/admin/perfis");
}
