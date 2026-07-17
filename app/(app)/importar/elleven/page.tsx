import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual } from "@/lib/periodo";
import { ImportarEllevenView } from "./importar-elleven-view";

export default async function ImportarEllevenPage() {
  await requireAdmin();

  const funcionarios = await prisma.funcionario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, cidade: { select: { nome: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar do elleven</h1>
        <p className="text-muted-foreground">
          Gera lançamentos a partir dos contratos de ativação já sincronizados
          automaticamente do elleven. Revise o casamento de vendedores e a
          classificação de produtos antes de confirmar — nada é gravado até
          você confirmar.
        </p>
      </div>
      <ImportarEllevenView funcionarios={funcionarios} periodoInicial={periodoAtual()} />
    </div>
  );
}
