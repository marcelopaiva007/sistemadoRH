import { redirect } from "next/navigation";

// Esta tela documentava os quatro papéis fixos (ADMIN/DIRETORIA/RH_MANAGER/
// GESTOR_SETOR) — o sistema de acesso ANTIGO. Desde 26/08/2026 o cadastro de
// acesso é único e dos dois sistemas: usuários e perfis moram em /cadastros
// (item "Usuários e perfis" no topo), e é a matriz do perfil que diz o que
// cada um vê e edita, por tela. A rota fica de pé só para link antigo não
// quebrar.
export default function PapeisPage() {
  redirect("/cadastros/perfis");
}
