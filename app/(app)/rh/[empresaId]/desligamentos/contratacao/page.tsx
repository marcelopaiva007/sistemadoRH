import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { montarArea, type ParametrosDaArea } from "@/lib/desligamentos/area";
import { contratacaoErrada } from "@/lib/desligamentos/analises";
import { ContratacaoView } from "./contratacao-view";

/**
 * Contratação errada — quem saiu com menos de 90 e de 180 dias de casa, por
 * setor e por gestor, e quanto das admissões do período já foi embora. É a
 * outra metade do princípio da área: "contratar bem para demitir menos".
 * Tempo de casa pela entrada no GRUPO: quem foi transferido não zera.
 */
export default async function ContratacaoPage({
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
    <ContratacaoView
      empresaId={empresaId}
      dados={contratacaoErrada(area.fichas, area.periodo, area.hoje, formatarData)}
      filtros={area.filtros}
      nomeDoRecorte={area.nomeDoRecorte}
      avisos={area.avisos}
    />
  );
}
