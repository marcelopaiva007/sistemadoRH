import { CentralPendencias } from "../../central-pendencias";

// Pendências da área de CONTRATOS (v1.204.0): renovação, reajuste, ação
// renovatória e aluguel em atraso. As da frota ficam na raiz do módulo.
export default async function PendenciasContratosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas } = await searchParams;
  return <CentralPendencias empresaId={empresaId} empresasParam={empresas} area="contratos" />;
}
