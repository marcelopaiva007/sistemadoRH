import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { FuncionariosTable } from "./funcionarios-table";

export default async function FuncionariosPage() {
  await requireAdmin();

  const [funcionarios, cidades, equipes] = await Promise.all([
    prisma.funcionario.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { cidade: true, equipe: true },
    }),
    prisma.cidade.findMany({ orderBy: { nome: "asc" } }),
    prisma.equipe.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funcionários</h1>
          <p className="text-muted-foreground">
            Vendedores externos, atendimento/administrativo, supervisores e outros
            setores. Cadastre uma vez, reaproveite em todos os meses.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/cadastros/funcionarios/elleven" />}
        >
          <RefreshCw className="size-4" />
          Atualizar pelo elleven
        </Button>
      </div>
      <FuncionariosTable funcionarios={funcionarios} cidades={cidades} equipes={equipes} />
    </div>
  );
}
