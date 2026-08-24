import { escopoDeEmpresas, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import {
  pendenciasDaEmpresa,
  modulosSemRegistro,
  pesquisasAbertasDaEmpresa,
  ciclosAEncerrarDaEmpresa,
} from "@/lib/pendencias";
import { resumoDaEmpresa, lacunasDaBase, lacunasDosDesligados } from "@/lib/dashboard";
import { DashboardEmpresa } from "./dashboard-empresa";
import { PendenciasView } from "./pendencias-view";
import { LacunasView } from "./lacunas-view";
import { LacunasDosDesligadosView } from "./lacunas-desligados-view";
import { HRWelcomeBanner } from "@/app/components/HRIllustrations";

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
  const usuario = await requireEmpresaAccess(empresaId);

  // Sem filtro, TODAS as empresas que o usuário enxerga — não só a marca do
  // CNPJ do caminho. Era "mesma marca" até 23/08/2026, e isso descasava do
  // seletor de marca/CNPJ da barra de topo: escolher "Todas as marcas" ali
  // limpa o `?empresas=` da URL, mas esta tela continuava mostrando só a
  // marca de antes — a pessoa clicava e "nada acontecia". `escopoDeEmpresas`
  // é a mesma interseção usada pelo resto do sistema (id digitado à mão na
  // URL não vira acesso).
  const empresas = await escopoDeEmpresas(usuario, empresasParam);

  const [resumo, pendencias, base, semRegistro, baseDesligados, pesquisasAbertas, ciclosAEncerrar] =
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
      ciclosAEncerrarDaEmpresa(empresas),
    ]);

  return (
    <div className="space-y-8">
      <HRWelcomeBanner />
      <DashboardEmpresa empresaId={empresaId} resumo={resumo} />
      <PendenciasView
        empresaId={empresaId}
        escopo={empresas}
        pendencias={pendencias}
        semRegistro={[...semRegistro]}
        diasAlerta={DIAS_ALERTA_VENCIMENTO}
        pesquisasAbertas={pesquisasAbertas}
        ciclosAEncerrar={ciclosAEncerrar}
      />
      {/* Por último: pendência é o que exige ação HOJE; preenchimento da base
          é o trabalho de fundo que faz os módulos valerem. */}
      <LacunasView
        empresaId={empresaId}
        empresasNoEscopo={empresas}
        ativos={base.ativos}
        lacunas={base.lacunas}
      />
      <LacunasDosDesligadosView
        empresaId={empresaId}
        empresasNoEscopo={empresas}
        desligados={baseDesligados.desligados}
        lacunas={baseDesligados.lacunas}
      />
    </div>
  );
}
