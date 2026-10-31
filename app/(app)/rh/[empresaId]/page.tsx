import { empresasVisiveis, escopoDeEmpresas, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import {
  pendenciasDaEmpresa,
  modulosSemRegistro,
  pesquisasAbertasDaEmpresa,
  ciclosAEncerrarDaEmpresa,
  vencidosDaEmpresa,
} from "@/lib/pendencias";
import { resumoDaEmpresa, lacunasDaBase, lacunasDosDesligados } from "@/lib/dashboard";
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
  const usuario = await requireEmpresaAccess(empresaId);

  // Sem filtro, TODAS as empresas que o usuário enxerga — não só a marca do
  // CNPJ do caminho. Era "mesma marca" até 23/08/2026, e isso descasava do
  // seletor de marca/CNPJ da barra de topo: escolher "Todas as marcas" ali
  // limpa o `?empresas=` da URL, mas esta tela continuava mostrando só a
  // marca de antes — a pessoa clicava e "nada acontecia". `escopoDeEmpresas`
  // é a mesma interseção usada pelo resto do sistema (id digitado à mão na
  // URL não vira acesso).
  const empresas = await escopoDeEmpresas(usuario, empresasParam);
  const visiveis = await empresasVisiveis(usuario);

  const [resumo, pendencias, base, semRegistro, baseDesligados, pesquisasAbertas, ciclosAEncerrar, vencidos] =
    await Promise.all([
      resumoDaEmpresa(empresas),
      pendenciasDaEmpresa(empresas, prisma, visiveis),
      lacunasDaBase(empresas),
      // Zero de pendência e zero de registro são a mesma tela e significados
      // opostos — a view precisa dos dois para não chamar de "em dia" um módulo
      // que ninguém abriu.
      modulosSemRegistro(empresas),
      lacunasDosDesligados(empresas),
      pesquisasAbertasDaEmpresa(empresas),
      ciclosAEncerrarDaEmpresa(empresas),
      // O que já venceu dentro de ASO/NR/Contrato "vencendo" — o RH começa por ali.
      vencidosDaEmpresa(empresas),
    ]);

  return (
    <div className="space-y-8">
      {/* Título no padrão das outras telas (h1 + uma linha). Até a v1.182.0
          aqui morava um banner "Bem-vindo ao Sistema RH" de 160px, com
          ilustração genérica — o espaço mais nobre da tela que abre a cada
          login, e não dizia nada que a pessoa já não soubesse. O nome é o do
          item da lateral que abre esta tela (rh-empresa-nav.tsx, `topo`). */}
      <div>
        <h1>Pendências</h1>
        <p className="text-sm text-muted-foreground">Os números do recorte escolhido e o que pede ação hoje.</p>
      </div>
      <DashboardEmpresa empresaId={empresaId} resumo={resumo} />
      <PendenciasView
        empresaId={empresaId}
        escopo={empresas}
        pendencias={pendencias}
        semRegistro={[...semRegistro]}
        diasAlerta={DIAS_ALERTA_VENCIMENTO}
        pesquisasAbertas={pesquisasAbertas}
        ciclosAEncerrar={ciclosAEncerrar}
        vencidos={vencidos}
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
