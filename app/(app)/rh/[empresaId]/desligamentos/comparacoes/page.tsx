import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { montarArea, type ParametrosDaArea } from "@/lib/desligamentos/area";
import { indicadoresDoNegocio } from "@/lib/desligamentos/base";
import { comparacaoAnual, serieMensal } from "@/lib/desligamentos/analises";
import { ComparacoesView } from "./comparacoes-view";

/**
 * Comparações — mês a mês (12 e 24 meses) e ano contra ano, com o crescimento
 * do quadro lado a lado com o crescimento do negócio (clientes e faturamento,
 * digitados pela diretoria). A pergunta que a tela responde: a equipe cresceu
 * na mesma medida do negócio?
 */
export default async function ComparacoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<ParametrosDaArea>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const [area, indicadores] = await Promise.all([
    montarArea(empresaId, usuario, await searchParams),
    indicadoresDoNegocio(empresaId),
  ]);
  const anoAtual = area.filtros.anoAtual;
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual];

  return (
    <ComparacoesView
      empresaId={empresaId}
      serie24={serieMensal(area.fichas, area.ativosHoje, area.hoje, 24)}
      anos={comparacaoAnual(area.fichas, area.ativosHoje, anos, area.hoje, indicadores)}
      filtros={area.filtros}
      nomeDoRecorte={area.nomeDoRecorte}
      podeConfigurar={area.podeConfigurar}
      avisos={area.avisos}
    />
  );
}
