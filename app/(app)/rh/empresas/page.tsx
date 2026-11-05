import { requireAdminDoGrupo } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { EmpresasTable } from "./empresas-table";

export default async function EmpresasPage() {
  const { grupoId } = await requireAdminDoGrupo();

  const [empresas, marcas] = await Promise.all([
    prisma.empresa.findMany({
      where: { marca: { grupoId } },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { _count: { select: { setores: true, colaboradores: true, pesquisas: true } } },
    }),
    prisma.marca.findMany({
      where: { ativo: true, grupoId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="text-muted-foreground">
          Empresas atendidas pelo módulo de RH/clima organizacional. Cada uma tem seus
          próprios setores, posições, colaboradores e pesquisas.
        </p>
      </div>
      <EmpresasTable empresas={empresas} marcas={marcas} />
    </div>
  );
}
