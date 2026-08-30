import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { ehDirecao, paraPainel, SELECT_PAINEL } from "@/lib/delegacoes/consultas";
import { montarPainelEntregas } from "@/lib/delegacoes/painel-entregas";
import { JANELAS_VALIDAS, janelaValida } from "@/lib/delegacoes/relatorio";
import { TabelaEntregas } from "../tabela-entregas";

/**
 * RELATÓRIO DA DIREÇÃO (pedido do CEO em 29/08/2026, ao ver que o volume de
 * demandas vai crescer): a versão com HISTÓRICO e EXPORTÁVEL de "Como andam
 * as entregas" — mesma conta (montarPainelEntregas), mas para o GRUPO
 * INTEIRO, por período, em vez de "o que eu deleguei, sempre tudo".
 *
 * Só quem `ehDirecao` entra — mesma guarda em duas camadas do Painel
 * (requireDelegacoesAccess = "usa o módulo?", ehDirecao = "vê o grupo
 * inteiro?").
 *
 * O período filtra por `createdAt`: quando a demanda foi CRIADA, não a
 * última data relevante por status — uma única fonte de verdade, fácil de
 * entender e de trocar depois se a Direção quiser outro corte.
 */
export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const usuario = await requireDelegacoesAccess();
  if (!ehDirecao(usuario)) redirect("/delegacoes");

  const { dias } = await searchParams;
  const janelaDias = janelaValida(dias);

  const agora = new Date();
  const inicioJanela = new Date(agora);
  inicioJanela.setDate(inicioJanela.getDate() - (janelaDias - 1));
  inicioJanela.setHours(0, 0, 0, 0);

  const linhas = await prisma.demanda.findMany({
    where: { createdAt: { gte: inicioJanela } },
    select: SELECT_PAINEL,
  });

  const painel = montarPainelEntregas(linhas.map((d) => paraPainel(d)), agora);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Delegações
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Relatório</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Como o grupo inteiro está entregando — não só o que você delegou.
          </p>
        </div>
        <a
          href={`/api/delegacoes/relatorio/csv?dias=${janelaDias}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Exportar CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Demandas criadas nos últimos {janelaDias} dias.
        </p>
        <div className="flex gap-1">
          {JANELAS_VALIDAS.map((d) => (
            <a
              key={d}
              href={`?dias=${d}`}
              className={
                d === janelaDias
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {d} dias
            </a>
          ))}
        </div>
      </div>

      {painel.linhas.length === 0 ? (
        <p className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhuma demanda criada neste período.
        </p>
      ) : (
        <TabelaEntregas
          painel={painel}
          titulo="Como andam as entregas — grupo inteiro"
          descricao={
            <>
              Por pessoa, sobre as demandas de todo mundo criadas no período acima.
              &quot;Tempo até entregar&quot; conta do aceite até a entrega — tempo corrido, não
              apontamento de horas trabalhadas, que o sistema não tem. &quot;Horas
              estimadas&quot; é o que se planejou antes de começar; &quot;dentro da
              estimativa&quot; só conta entre as entregas que têm os dois números.
            </>
          }
        />
      )}
    </div>
  );
}
