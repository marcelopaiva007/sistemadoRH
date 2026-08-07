import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
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
  const usuario = await requireEmpresaAccess(empresaId);

  // Padrão é a MARCA, como o organograma: contar só o CNPJ do endereço
  // mostrava um pedaço e escondia o resto sem avisar — 13 sem Telegram na RSM
  // quando o grupo tinha 93. O filtro `?empresas=` (mesmo de
  // filtro-empresas.tsx, já usado em Férias/Vencimentos/Aprovações/etc.)
  // deixa estreitar para um CNPJ específico quando é isso que a pessoa quer —
  // opção explícita, não o padrão silencioso.
  //
  // ∩ empresasVisiveis: os links das lacunas abrem a lista de Colaboradores,
  // que é escopada ao que o USUÁRIO enxerga — um RH com acesso a 1 CNPJ da
  // marca via para "93 sem Telegram" aqui e uma lista de 13 lá
  // (requireEmpresaAccess deixa entrar por marca, mas a lista não). Contar
  // aqui o que a pessoa não consegue listar é fabricar número que não bate.
  const [todasDaMarca, visiveis] = await Promise.all([
    empresasDaMesmaMarca(empresaId),
    empresasVisiveis(usuario),
  ]);
  const daMarcaVisiveis = todasDaMarca.filter((id) => visiveis.includes(id));
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const empresas =
    pedidas.length === 0 ? daMarcaVisiveis : daMarcaVisiveis.filter((id) => pedidas.includes(id));

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
        escopo={empresas}
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
