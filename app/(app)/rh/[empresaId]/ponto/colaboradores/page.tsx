import { prisma } from "@/lib/prisma";
import { ColaboradoresPontoView } from "../colaboradores-ponto-view";

/**
 * Quem pode bater ponto — liberação individual e PIN do app /ponto.
 *
 * Era a aba "Colaboradores" da tela única; virou página em v1.170.0. O rótulo
 * na lateral é "Liberação & PIN", e não "Colaboradores": duas entradas com o
 * mesmo nome no mesmo menu (a outra é a ficha de todo mundo, em Ciclo de vida)
 * obrigariam a clicar para descobrir qual é qual.
 */
export default async function PontoColaboradoresPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
      pontoLiberado: true,
      // Só o booleano "tem PIN?" atravessa para o cliente — o hash nunca.
      pontoPinHash: true,
    },
  });

  return (
    <ColaboradoresPontoView
      empresaId={empresaId}
      colaboradores={colaboradores.map((c) => ({
        id: c.id,
        nome: c.nome,
        setor: c.setor.nome,
        cargo: c.posicao.nome,
        pontoLiberado: c.pontoLiberado,
        temPin: c.pontoPinHash !== null,
      }))}
    />
  );
}
