import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { UsuariosTable } from "./usuarios-table";

export default async function UsuariosPage() {
  await requireAdmin();

  const [usuarios, empresas, setores] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { nome: "asc" }],
      include: { empresa: true, setor: true },
    }),
    prisma.empresa.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.setor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">
          Contas de acesso ao sistema. RH_MANAGER e GESTOR_SETOR ficam vinculados a uma
          empresa (e, no caso de GESTOR_SETOR, também a um setor) do módulo de RH.
        </p>
      </div>
      <UsuariosTable usuarios={usuarios} empresas={empresas} setores={setores} />
    </div>
  );
}
