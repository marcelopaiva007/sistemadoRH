import { CentralPendencias } from "./central-pendencias";

// Abertura do módulo = Pendências da FROTA (v1.204.0). As dos contratos ficam
// em `contratos/pendencias`, na área de Contratos — ver lib/processos/areas.ts.
export default async function PendenciasFrotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas } = await searchParams;
  return <CentralPendencias empresaId={empresaId} empresasParam={empresas} area="frota" />;
}
