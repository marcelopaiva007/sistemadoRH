import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import { pendenciasDaEmpresa } from "@/lib/pendencias";
import { resumoDaEmpresa, lacunasDaBase } from "@/lib/dashboard";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { DashboardEmpresa } from "./dashboard-empresa";
import { PendenciasView } from "./pendencias-view";
import { LacunasView } from "./lacunas-view";

// Tela inicial da empresa: os números no topo (o retrato) e logo abaixo o que
// exige ação hoje (a lista de tarefas). Nessa ordem de propósito — quem abre
// o sistema quer situar-se antes de agir.
//
// Os dois blocos usam agregação, não carga de tabela: esta é a tela que abre
// a cada login e a cada troca de empresa.
export default async function InicioDaEmpresaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  // A tela é da MARCA, como o organograma: contar só o CNPJ do endereço
  // mostrava um pedaço e escondia o resto sem avisar — 13 sem Telegram na RSM
  // quando o grupo tinha 93.
  const empresas = await empresasDaMesmaMarca(empresaId);

  const [resumo, pendencias, base] = await Promise.all([
    resumoDaEmpresa(empresas),
    pendenciasDaEmpresa(empresas),
    lacunasDaBase(empresas),
  ]);

  return (
    <div className="space-y-8">
      <DashboardEmpresa empresaId={empresaId} resumo={resumo} />
      <PendenciasView empresaId={empresaId} pendencias={pendencias} diasAlerta={DIAS_ALERTA_VENCIMENTO} />
      {/* Por último: pendência é o que exige ação HOJE; preenchimento da base
          é o trabalho de fundo que faz os módulos valerem. */}
      <LacunasView
        empresaId={empresaId}
        empresasDaMarca={empresas}
        ativos={base.ativos}
        lacunas={base.lacunas}
      />
    </div>
  );
}
