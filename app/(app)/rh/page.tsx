import { redirect } from "next/navigation";
import { requireRHAccess } from "@/lib/rh-auth-guard";

// A lista de empresas virou a própria raiz do sistema (`/`) em 25/07/2026 —
// eram duas telas fazendo a mesma coisa. Esta rota fica só como porta velha:
// links e favoritos antigos continuam funcionando.
export default async function RHHubPage() {
  const user = await requireRHAccess();
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");
  redirect("/");
}
