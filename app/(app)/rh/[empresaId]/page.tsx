import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import { pendenciasDaEmpresa } from "@/lib/pendencias";
import { PendenciasView } from "./pendencias-view";

// Tela inicial da empresa: o que exige ação hoje, não um retrato do passado.
// Cada bloco leva para a tela onde a coisa se resolve. O cálculo mora em
// lib/pendencias.ts, compartilhado com a visão do grupo em `/`.
export default async function PendenciasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pendencias = await pendenciasDaEmpresa(empresaId);

  return (
    <PendenciasView empresaId={empresaId} pendencias={pendencias} diasAlerta={DIAS_ALERTA_VENCIMENTO} />
  );
}
