import { prisma } from "@/lib/prisma";
import { TratamentoView } from "../tratamento-view";

/**
 * Tratamento de ponto (PTRP) — pedidos de ajuste e a decisão do RH sobre eles.
 * Era a aba "Tratamento (PTRP)"; virou página em v1.170.0.
 */
export default async function PontoTratamentoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  const [pendentes, historico, paraSelecao] = await Promise.all([
    // Duas consultas, não uma com `take`: os PENDENTES vêm inteiros, porque
    // desde 11/08/2026 é nesta lista que se aprova ou rejeita — com o corte de
    // 20 que existia aqui, um ajuste que passasse dessa posição ficaria sem
    // nenhuma tela onde decidir. O corte continua valendo para o histórico já
    // decidido, que é só leitura.
    prisma.tratamentoPonto.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      include: {
        colaborador: {
          select: {
            nome: true,
            setor: { select: { nome: true } },
            posicao: { select: { nome: true } },
          },
        },
      },
    }),
    prisma.tratamentoPonto.findMany({
      where: { empresaId, status: { not: "PENDENTE" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        colaborador: {
          select: {
            nome: true,
            setor: { select: { nome: true } },
            posicao: { select: { nome: true } },
          },
        },
      },
    }),
    // Para o seletor do formulário: inclui DESLIGADOS. O ajuste de ponto de
    // quem saiu é justamente o que se faz durante o cálculo da rescisão — com
    // a lista só de ativos, esse caso ficava sem caminho na tela.
    prisma.colaborador.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, ativo: true },
    }),
  ]);

  return (
    <TratamentoView
      empresaId={empresaId}
      // Pendentes primeiro e sempre: são os que exigem ação.
      tratamentos={[...pendentes, ...historico]}
      colaboradores={paraSelecao}
    />
  );
}
