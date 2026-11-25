import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { montarArea, type ParametrosDaArea } from "@/lib/desligamentos/area";
import { pendenciasDeDados } from "@/lib/desligamentos/analises";
import { PendenciasView } from "./pendencias-view";

/**
 * Pendências de dados da área Desligamentos — o que impede as outras abas de
 * serem completas: saída sem setor de verdade, sem motivo, sem causa, ficha
 * desligada sem data, e saída que parece transferência não marcada. Cada
 * linha leva à ficha, onde a correção é feita. Todo o histórico (não só o
 * período escolhido): dado errado de 2024 continua distorcendo o ano a ano.
 */
export default async function PendenciasDaAreaPage({
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
    <PendenciasView
      empresaId={empresaId}
      pendencias={pendenciasDeDados(area.fichas, formatarData, area.base.possiveisTransferencias)}
      filtros={area.filtros}
      nomeDoRecorte={area.nomeDoRecorte}
    />
  );
}
