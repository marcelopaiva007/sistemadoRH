import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { CidadesTable } from "./cidades-table";

export default async function CidadesPage() {
  await requireAdmin();

  const cidades = await prisma.cidade.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { funcionarios: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cidades</h1>
        <p className="text-muted-foreground">
          Cidades atendidas pela LM Telecom. Cadastre uma vez, use em todos os meses.
        </p>
      </div>
      <CidadesTable cidades={cidades} />
    </div>
  );
}
