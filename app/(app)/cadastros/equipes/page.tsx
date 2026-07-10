import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { EquipesTable } from "./equipes-table";

export default async function EquipesPage() {
  await requireAdmin();

  const [equipes, supervisores] = await Promise.all([
    prisma.equipe.findMany({
      orderBy: { nome: "asc" },
      include: { supervisor: true, _count: { select: { membros: true } } },
    }),
    prisma.funcionario.findMany({
      where: { cargo: "SUPERVISOR", ativo: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipes</h1>
        <p className="text-muted-foreground">
          Equipes de vendedores externos, cada uma com um supervisor e uma faixa de
          bonificação (3 ou 5 vendedores).
        </p>
      </div>
      <EquipesTable equipes={equipes} supervisores={supervisores} />
    </div>
  );
}
