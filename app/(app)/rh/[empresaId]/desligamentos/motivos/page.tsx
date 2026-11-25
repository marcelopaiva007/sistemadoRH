import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { montarArea, type ParametrosDaArea } from "@/lib/desligamentos/area";
import { motivosDasSaidas } from "@/lib/desligamentos/analises";
import { MotivosView } from "./motivos-view";

/**
 * Motivos das saídas — a causa gerencial (desempenho, comportamento,
 * reestruturação...) por setor e por gestor, e quem decidiu a saída (empresa ×
 * pedido). A causa só existe para desligamentos registrados a partir da
 * v1.213.0 ou classificados depois pelo RH; o resto aparece como "sem causa
 * registrada", e a aba Pendências lista quem falta classificar.
 */
export default async function MotivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<ParametrosDaArea>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const area = await montarArea(empresaId, usuario, await searchParams);

  return (
    <MotivosView
      empresaId={empresaId}
      motivos={motivosDasSaidas(area.fichas, area.periodo, area.hoje)}
      filtros={area.filtros}
      nomeDoRecorte={area.nomeDoRecorte}
      avisos={area.avisos}
    />
  );
}
