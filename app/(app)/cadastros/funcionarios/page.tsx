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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funcionários</h1>
        <p className="text-muted-foreground">
          Vendedores externos, atendimento/administrativo, supervisores e outros
          setores. Cadastre uma vez, reaproveite em todos os meses.
        </p>
      </div>
      <FuncionariosTable funcionarios={funcionarios} cidades={cidades} equipes={equipes} />
    </div>
  );
}
