import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import {
  selecionarCampanhaAtual,
  calcularCoberturaCampanha,
  type CoberturaCampanha,
} from "@/lib/avaliacao-cobertura";
import { AvaliacoesView } from "./avaliacoes-view";

// Lista de ciclos de avaliação de desempenho da empresa. Cada ciclo abre numa
// página própria (o detalhe fica grande: avaliações, nine-box, avaliador
// extra) — aqui é só o painel de controle para criar/acompanhar/encerrar.
//
// No topo entra o placar da campanha atual, que é do GRUPO (todas as empresas
// visíveis, como o Painel): cobertura por CNPJ, fila por avaliador e o gap
// autoavaliação × gestor. A fila pessoal de cada avaliador já existe no portal
// do gestor — aqui é o contador consolidado para o RH, não uma reconstrução.
export default async function AvaliacoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [ciclosGrupo, contagens, empresas, ativosPorEmpresa] = await Promise.all([
    prisma.cicloAvaliacao.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: { dataInicio: "desc" },
      select: {
        id: true,
        empresaId: true,
        nome: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        encerrado: true,
      },
    }),
    prisma.avaliacaoDesempenho.groupBy({
      by: ["cicloId", "status"],
      where: { empresaId },
      _count: true,
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true },
    }),
    prisma.colaborador.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresasDoUsuario }, ativo: true },
      _count: true,
    }),
  ]);

  // Cards de ciclo continuam sendo só DESTA empresa — o placar é que é do grupo.
  const ciclos = ciclosGrupo.filter((c) => c.empresaId === empresaId);

  const progresso = new Map<string, { total: number; concluidas: number }>();
  for (const c of contagens) {
    const atual = progresso.get(c.cicloId) ?? { total: 0, concluidas: 0 };
    atual.total += c._count;
    if (c.status === "CONCLUIDA") atual.concluidas += c._count;
    progresso.set(c.cicloId, atual);
  }

  const campanha = selecionarCampanhaAtual(ciclosGrupo);
  let cobertura: CoberturaCampanha | null = null;
  if (campanha) {
    // `select` explícito e nada de nota além do necessário: notaFinal/potencial
    // alimentam o gap, e nomes aqui são os mesmos que o RH já vê no detalhe do
    // ciclo. Salário e afins nem são buscados.
    const avaliacoes = await prisma.avaliacaoDesempenho.findMany({
      where: { cicloId: { in: campanha.ciclos.map((c) => c.id) } },
      select: {
        empresaId: true,
        cicloId: true,
        colaboradorId: true,
        tipoAvaliador: true,
        avaliadorId: true,
        avaliadorNome: true,
        status: true,
        notaFinal: true,
        potencial: true,
        colaborador: { select: { nome: true } },
      },
    });
    const ativosDe = new Map(ativosPorEmpresa.map((a) => [a.empresaId, a._count]));
    cobertura = calcularCoberturaCampanha(
      campanha,
      avaliacoes.map((a) => ({ ...a, colaboradorNome: a.colaborador.nome })),
      empresas.map((e) => ({ id: e.id, nome: e.nome, ativos: ativosDe.get(e.id) ?? 0 })),
    );
  }

  return (
    <AvaliacoesView
      empresaId={empresaId}
      ciclos={ciclos.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        dataInicio: c.dataInicio,
        dataFim: c.dataFim,
        encerrado: c.encerrado,
        progresso: progresso.get(c.id) ?? { total: 0, concluidas: 0 },
      }))}
      cobertura={cobertura}
    />
  );
}
