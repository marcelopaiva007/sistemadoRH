import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { EmpresasTable } from "./empresas-table";

export default async function EmpresasPage() {
  await requireAdmin();

  const empresas = await prisma.empresa.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { setores: true, colaboradores: true, pesquisas: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="text-muted-foreground">
          Empresas atendidas pelo módulo de RH/clima organizacional. Cada uma tem seus
          próprios setores, posições, colaboradores e pesquisas.
        </p>
      </div>
      <EmpresasTable empresas={empresas} />
    </div>
  );
}
