import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaSaoPaulo } from "@/lib/email";
import { somarDiasUTC, formatarDataHoraBrasilia } from "@/lib/datas";
import { produtividadePorUsuario, produtividadePorCategoria } from "@/lib/produtividade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { cn } from "@/lib/utils";

// Produtividade da equipe de RH: contagem de ações no AuditLog por conta de
// sistema, curada em categorias de processo (lib/produtividade.ts). Só conta
// de sistema (ADMIN/DIRETORIA/RH_MANAGER/GESTOR_SETOR) — ação do portal do
// colaborador (que audita a própria pessoa, não uma conta) fica de fora por
// causa do filtro de usuarioRole abaixo. Tela cross-empresa, por isso mora no
// menu do topo (nav-config.ts) e não na lateral de dentro de uma empresa; o
// filtro de empresa aqui é link simples (?empresa=id), não o hook client-side
// de filtro-empresas.tsx — aquele existe pra trocar o segmento [empresaId] no
// caminho de dentro de /rh, que esta rota nem tem.
const PAPEIS_SISTEMA = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"];

const PERIODOS = {
  hoje: { label: "Hoje", diasAntes: 0 },
  "7d": { label: "Últimos 7 dias", diasAntes: 6 },
  "30d": { label: "Últimos 30 dias", diasAntes: 29 },
} as const;
type PeriodoChave = keyof typeof PERIODOS;

function hrefFiltro(periodo: PeriodoChave, empresaId: string | null) {
  const params = new URLSearchParams({ periodo });
  if (empresaId) params.set("empresa", empresaId);
  return `?${params.toString()}`;
}

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; empresa?: string }>;
}) {
  await requireGestaoUsuarios();
  const { periodo: periodoParam, empresa: empresaParam } = await searchParams;
  const periodo: PeriodoChave =
    periodoParam && periodoParam in PERIODOS ? (periodoParam as PeriodoChave) : "hoje";
  const desde = somarDiasUTC(inicioDoDiaSaoPaulo(), -PERIODOS[periodo].diasAntes);

  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  const empresaSelecionada = empresas.some((e) => e.id === empresaParam) ? (empresaParam ?? null) : null;

  const registros = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: desde },
      usuarioRole: { in: PAPEIS_SISTEMA },
      ...(empresaSelecionada ? { empresaId: empresaSelecionada } : {}),
    },
    select: { usuarioId: true, usuarioNome: true, usuarioRole: true, entidade: true, createdAt: true },
  });

  const porUsuario = produtividadePorUsuario(registros);
  const porCategoria = produtividadePorCategoria(registros);
  const totalAcoes = porCategoria.reduce((soma, c) => soma + c.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Produtividade da equipe de RH</h1>
        <p className="text-sm text-muted-foreground">
          Ações registradas na trilha de auditoria, por conta de sistema (ADMIN, Diretoria, gestor de
          RH e gestor de setor) — não por colaborador. É contagem de eventos, não peso de esforço:
          editar um campo da ficha conta igual a concluir um checklist inteiro. Serve pra ver quem
          está atuando e em que área, não como avaliação isolada de desempenho.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex gap-1">
          {(Object.entries(PERIODOS) as [PeriodoChave, (typeof PERIODOS)[PeriodoChave]][]).map(
            ([chave, info]) => (
              <a
                key={chave}
                href={hrefFiltro(chave, empresaSelecionada)}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  chave === periodo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {info.label}
              </a>
            ),
          )}
        </div>

        {empresas.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <a
              href={hrefFiltro(periodo, null)}
              className={cn(
                "rounded-md px-3 py-1.5",
                empresaSelecionada === null
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Todas as empresas
            </a>
            {empresas.map((e) => (
              <a
                key={e.id}
                href={hrefFiltro(periodo, e.id)}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  empresaSelecionada === e.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {e.nome}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Indicador rotulo="Total de ações" valor={totalAcoes} variante="cartao" />
        <Indicador rotulo="Contas ativas" valor={porUsuario.length} variante="cartao" />
        {porCategoria.map((c) => (
          <Indicador key={c.categoria} rotulo={c.categoria} valor={c.total} variante="cartao" />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por conta</CardTitle>
          <CardDescription>
            {porUsuario.length} conta(s) com ação registrada no período
            {empresaSelecionada && (
              <> em {empresas.find((e) => e.id === empresaSelecionada)?.nome}</>
            )}
            . Ordenado da mais para a menos ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {porUsuario.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma ação de conta de sistema registrada neste período.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Quem</TableHead>
                    <TableHead className="w-20">Total</TableHead>
                    <TableHead>Detalhamento</TableHead>
                    <TableHead className="w-44">Última ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porUsuario.map((linha) => {
                    const detalhamento = Object.entries(linha.porCategoria)
                      .filter(([, total]) => total > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([categoria, total]) => `${categoria}: ${total}`)
                      .join(" · ");
                    return (
                      <TableRow key={linha.usuarioId}>
                        <TableCell>
                          {linha.usuarioNome}
                          {linha.usuarioRole && (
                            <span className="block text-xs text-muted-foreground">
                              {linha.usuarioRole}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{linha.total}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{detalhamento}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                          {formatarDataHoraBrasilia(linha.ultimaAcaoEm)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
