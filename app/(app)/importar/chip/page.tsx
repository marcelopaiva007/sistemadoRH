import { requireAdmin } from "@/lib/auth-guard";
import { periodoAtual } from "@/lib/periodo";
import { ImportarChipView } from "./importar-chip-view";

export default async function ImportarChipPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Vendas de Chip (L&M Movel)
        </h1>
        <p className="text-muted-foreground">
          As vendas de chip são importadas automaticamente todos os dias do
          sistema de telefonia móvel e aplicadas aos lançamentos — sem passo
          manual. Use esta tela para conferir os números e verificar se todos os
          vendedores foram mapeados para o cadastro de funcionários.
        </p>
      </div>
      <ImportarChipView periodoInicial={periodoAtual()} />
    </div>
  );
}
