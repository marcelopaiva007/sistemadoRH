import { requireUser } from "@/lib/auth-guard";
import { periodoAtual } from "@/lib/periodo";
import { carregarAcompanhamento } from "@/lib/acompanhamento-data";
import { MetasView } from "./metas-view";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireUser();
  const { periodo: periodoParam } = await searchParams;
  const periodo = periodoParam?.match(/^\d{4}-\d{2}$/) ? periodoParam : periodoAtual();

  const acompanhamentos = await carregarAcompanhamento(periodo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Acompanhamento de Metas</h1>
        <p className="text-muted-foreground">
          Progresso de cada vendedor, supervisor e gestor em relação à meta do mês,
          com um feedback do que falta para subir de faixa. Base: as vendas já
          sincronizadas e as Regras de Bonificação vigentes.
        </p>
      </div>
      <MetasView acompanhamentos={acompanhamentos} periodo={periodo} />
    </div>
  );
}
