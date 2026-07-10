import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual } from "@/lib/periodo";
import { ImportarView } from "./importar-view";

export default async function ImportarPage() {
  await requireAdmin();

  const funcionarios = await prisma.funcionario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, cidade: { select: { nome: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar Planilha/CSV</h1>
        <p className="text-muted-foreground">
          Importe o arquivo exportado do sistema de vendas. O mapeamento de colunas
          fica salvo neste navegador para os próximos meses.
        </p>
      </div>
      <ImportarView funcionarios={funcionarios} periodoInicial={periodoAtual()} />
    </div>
  );
}
