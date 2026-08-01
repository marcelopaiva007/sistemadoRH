import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularPainelAvaliacao } from "@/lib/avaliacao-painel";
import { PainelAvaliacaoView } from "./painel-view";

// Painel consolidado — não é de UM ciclo, é de uma CAMPANHA: o mesmo nome de
// ciclo pode existir em vários CNPJs (um CicloAvaliacao por empresa, ver
// lib/actions/rh-avaliacao.ts), e quem pergunta "como foi a avaliação deste
// semestre" pergunta pelo grupo inteiro, não CNPJ a CNPJ.
export default async function PainelAvaliacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ campanha?: string }>;
}) {
  const { empresaId } = await params;
  const { campanha: campanhaParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [ciclos, empresas] = await Promise.all([
    prisma.cicloAvaliacao.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: { dataInicio: "desc" },
      select: { id: true, nome: true, dataInicio: true, empresaId: true },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true },
    }),
  ]);

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const empresaNomeDe = (empresaId: string) => nomeDaEmpresa.get(empresaId) ?? "—";

  if (ciclos.length === 0) {
    return (
      <PainelAvaliacaoView
        empresaId={empresaId}
        campanhas={[]}
        campanhaSelecionada={null}
        dados={null}
      />
    );
  }

  // Campanhas ordenadas pela mais recente entre os CNPJs que a têm — uma
  // campanha só entra na lista uma vez, mesmo criada em cinco CNPJs.
  const campanhas = [...new Map(ciclos.map((c) => [c.nome, c])).values()]
    .sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime())
    .map((c) => c.nome);

  const campanhaSelecionada =
    campanhaParam && campanhas.includes(campanhaParam) ? campanhaParam : campanhas[0];

  const cicloIds = ciclos.filter((c) => c.nome === campanhaSelecionada).map((c) => c.id);

  const avaliacoes = await prisma.avaliacaoDesempenho.findMany({
    where: { cicloId: { in: cicloIds } },
    select: {
      empresaId: true,
      tipoAvaliador: true,
      status: true,
      notaFinal: true,
      colaborador: { select: { id: true, nome: true, setor: { select: { nome: true } } } },
    },
  });

  const dados = calcularPainelAvaliacao(avaliacoes, empresaNomeDe);

  return (
    <PainelAvaliacaoView
      empresaId={empresaId}
      campanhas={campanhas}
      campanhaSelecionada={campanhaSelecionada}
      dados={dados}
    />
  );
}
