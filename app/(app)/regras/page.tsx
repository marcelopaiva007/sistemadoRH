import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { RegrasView } from "./regras-view";

export default async function RegrasPage() {
  await requireAdmin();

  const regras = await prisma.regraBonificacao.findMany({
    orderBy: { vigenciaInicio: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras de Bonificação</h1>
        <p className="text-muted-foreground">
          Faixas e valores por serviço, por equipe e papel, além do bônus de
          supervisor. Cada mudança cria uma nova vigência — o histórico de regras
          anteriores fica preservado.
        </p>
      </div>
      <RegrasView regras={regras} />
    </div>
  );
}
