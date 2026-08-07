import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import {
  pendenciasDaEmpresa,
  modulosSemRegistro,
  pesquisasAbertasDaEmpresa,
} from "@/lib/pendencias";
import { resumoDaEmpresa, lacunasDaBase, lacunasDosDesligados } from "@/lib/dashboard";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { DashboardEmpresa } from "./dashboard-empresa";
import { PendenciasView } from "./pendencias-view";
import { LacunasView } from "./lacunas-view";
import { LacunasDosDesligadosView } from "./lacunas-desligados-view";

// Tela inicial da empresa: os números no topo (o retrato) e logo abaixo o que
// exige ação hoje (a lista de tarefas). Nessa ordem de propósito — quem abre
// o sistema quer situar-se antes de agir.
//
// Os dois blocos usam agregação, não carga de tabela: esta é a tela que abre
// a cada login e a cada troca de empresa.
export default async function InicioDaEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  await requireEmpresaAccess(empresaId);

  // Padrão é a MARCA, como o organograma: contar só o CNPJ do endereço
  // mostrava um pedaço e escondia o resto sem avisar — 13 sem Telegram na RSM
  // quando o grupo tinha 93. O filtro `?empresas=` (mesmo de
  // filtro-empresas.tsx, já usado em Férias/Vencimentos/Aprovações/etc.)
  // deixa estreitar para um CNPJ específico quando é isso que a pessoa quer —
  // opção explícita, não o padrão silencioso.
  const todasDaMarca = await empresasDaMesmaMarca(empresaId);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const empresas = pedidas.length === 0 ? todasDaMarca : todasDaMarca.filter((id) => pedidas.includes(id));

  const [resumo, pendencias, base, semRegistro, baseDesligados, pesquisasAbertas] =
    await Promise.all([
      resumoDaEmpresa(empresas),
      pendenciasDaEmpresa(empresas),
      lacunasDaBase(empresas),
      // Zero de pendência e zero de registro são a mesma tela e significados
      // opostos — a view precisa dos dois para não chamar de "em dia" um módulo
      // que ninguém abriu.
      modulosSemRegistro(empresas),
      lacunasDosDesligados(empresas),
      pesquisasAbertasDaEmpresa(empresas),
    ]);

  return (
    <div className="space-y-8">
      <DashboardEmpresa empresaId={empresaId} resumo={resumo} />
      <PendenciasView
        empresaId={empresaId}
        pendencias={pendencias}
        semRegistro={[...semRegistro]}
        diasAlerta={DIAS_ALERTA_VENCIMENTO}
        pesquisasAbertas={pesquisasAbertas}
      />
      {/* Por último: pendência é o que exige ação HOJE; preenchimento da base
          é o trabalho de fundo que faz os módulos valerem. */}
      <LacunasView
        empresaId={empresaId}
        empresasDaMarca={empresas}
        ativos={base.ativos}
        lacunas={base.lacunas}
      />
      <LacunasDosDesligadosView
        empresaId={empresaId}
        empresasDaMarca={empresas}
        desligados={baseDesligados.desligados}
        lacunas={baseDesligados.lacunas}
      />
    </div>
  );
}
