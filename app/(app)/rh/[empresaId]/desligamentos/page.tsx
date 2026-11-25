import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { montarArea, type ParametrosDaArea } from "@/lib/desligamentos/area";
import { detalheDoRecorte, placarDaMeta, quadroPorGestor, quadroPorSetor } from "@/lib/desligamentos/painel";
import { PainelDesligamentosView } from "./painel-desligamentos-view";

/**
 * Painel da área Desligamentos — a tela da reunião de gerentes.
 *
 * Responde, nesta ordem, o que a ordem de serviço do CEO (25/11/2026) pede:
 *   1. o placar da meta do ano (10% do quadro médio, limite de 15%);
 *   2. quanto isso custou (custo mínimo por desligamento × saídas);
 *   3. quais setores e quais gestores puxam o número para cima;
 *   4. o detalhe do setor ou gestor clicado.
 *
 * Todo número sai de lib/desligamentos/painel.ts (puro, testado); escopo,
 * filtros e avisos de lib/desligamentos/area.ts, os mesmos das outras abas e
 * do PDF. Escopo: tudo que o usuário enxerga, sem CNPJ — o `?empresas=` da
 * lateral NÃO recorta esta tela, de propósito.
 */
export default async function DesligamentosPainelPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<ParametrosDaArea>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const area = await montarArea(empresaId, usuario, await searchParams);
  const { fichas, ativosHoje, periodo, hoje, base } = area;

  return (
    <PainelDesligamentosView
      empresaId={empresaId}
      placar={placarDaMeta(fichas, ativosHoje, area.ano, hoje, base.config)}
      setores={quadroPorSetor(fichas, periodo, hoje, base.config)}
      gestores={quadroPorGestor(fichas, periodo, hoje, base.config)}
      detalhe={area.nomeDoRecorte ? detalheDoRecorte(fichas, periodo, hoje, formatarData) : null}
      nomeDoRecorte={area.nomeDoRecorte}
      config={base.config}
      podeConfigurar={area.podeConfigurar}
      filtros={area.filtros}
      avisos={area.avisos}
    />
  );
}
