import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireRHAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";

export default async function RHHubPage() {
  const user = await requireRHAccess();

  if (user.role === "RH_MANAGER" && user.empresaId) {
    redirect(`/rh/${user.empresaId}/colaboradores`);
  }
  if (user.role === "GESTOR_SETOR") {
    redirect("/rh/meu-setor");
  }

  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    include: { _count: { select: { colaboradores: true, pesquisas: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RH — Clima Organizacional</h1>
        <p className="text-muted-foreground">Selecione a empresa para gerenciar setores, colaboradores e pesquisas.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {empresas.map((e) => (
          <Link
            key={e.id}
            href={`/rh/${e.id}/colaboradores`}
            className="flex flex-col gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-muted"
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-muted-foreground" />
              <span className="font-medium">{e.nome}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {e._count.colaboradores} colaborador(es) · {e._count.pesquisas} pesquisa(s)
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
