import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { previsualizarVendedoresElleven } from "@/lib/actions/elleven";
import { SincronizarEllevenView } from "./sincronizar-elleven-view";

export default async function SincronizarVendedoresEllevenPage() {
  await requireAdmin();

  const [{ vendedores, totalContratos }, funcionarios] = await Promise.all([
    previsualizarVendedoresElleven(),
    prisma.funcionario.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Atualizar vendedores pelo elleven
        </h1>
        <p className="text-muted-foreground">
          Compara os vendedores dos contratos sincronizados do elleven com o
          cadastro de funcionários. Vendedores novos são criados como Vendedor
          Externo; nomes divergentes são atualizados para o nome do elleven (o
          que faz o casamento automático da importação funcionar). Nada é
          gravado até você aplicar.
        </p>
      </div>
      <SincronizarEllevenView
        vendedores={vendedores}
        funcionarios={funcionarios}
        totalContratos={totalContratos}
      />
    </div>
  );
}
