import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { UsuariosTable } from "./usuarios-table";

export default async function UsuariosPage() {
  const admin = await requireAdmin();

  const usuarios = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, username: true, role: true, createdAt: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">
          Cadastre quem acessa o sistema, com login e senha. Administrativo/Financeiro
          tem acesso total; Diretoria/Gestão vê apenas relatórios e fechamentos.
        </p>
      </div>
      <UsuariosTable
        usuarios={usuarios.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
        currentUserId={admin.id}
      />
    </div>
  );
}
