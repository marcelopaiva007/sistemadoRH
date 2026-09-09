import { prisma } from "@/lib/prisma";
import { diaBrasilia, janelaDoDiaBrasilia } from "@/lib/datas";
import { HistoricoPontoView } from "../historico-view";

/**
 * Histórico de marcações — tudo que ficou gravado em cada batida e tudo que
 * aconteceu com ela depois.
 *
 * Nasceu como aba em v1.169.0 (o RH não tinha onde consultar a batida de
 * ontem) e virou página com endereço próprio em v1.170.0 — que é o que permite
 * chegar aqui direto pela lateral, favoritar e mandar o link para alguém.
 */
export default async function PontoHistoricoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // A mesma lista do formulário de tratamento — com DESLIGADOS: a consulta ao
  // histórico de quem saiu é justamente o que se faz na conferência da rescisão.
  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, ativo: true },
  });

  // O período que a tela abre preenchida: os últimos 7 dias, em dias de
  // BRASÍLIA. Calculado no servidor, e não no cliente: o navegador de quem
  // consulta pode estar em outro fuso, e "hoje" precisa ser o mesmo dia que o
  // resto do módulo usa. Deriva de `janelaDoDiaBrasilia().inicio` (uma leitura
  // só do relógio) para as duas pontas caírem no mesmo dia mesmo na virada.
  const inicioDeHoje = janelaDoDiaBrasilia().inicio;
  const periodoInicial = {
    de: diaBrasilia(new Date(inicioDeHoje.getTime() - 6 * 24 * 60 * 60 * 1000)),
    ate: diaBrasilia(inicioDeHoje),
  };

  return (
    <HistoricoPontoView
      empresaId={empresaId}
      colaboradores={colaboradores}
      periodoInicial={periodoInicial}
    />
  );
}
