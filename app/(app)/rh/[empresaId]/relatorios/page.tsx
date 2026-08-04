import Link from "next/link";
import { FileDown, BarChart3 } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { NIVEIS_RISCO } from "@/lib/nr01";
import { nivelGeralComBackfill } from "@/lib/nr01-cache";
import { CONVITES_NA_PESQUISA, participacaoPct } from "@/lib/pesquisa-numeros";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusPesquisaLabel } from "@/lib/constants-rh";

// Central de relatórios da empresa: uma linha por pesquisa, com participação e
// (para avaliações NR-01) o nível de risco geral + acesso ao dashboard e ao
// relatório técnico em PDF. Sempre escopado à empresa da rota.
export default async function RelatoriosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [empresa, pesquisasBase, convitesPorPesquisa] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }),
    prisma.pesquisa.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { respostas: true } } },
    }),
    // Convites sem os excluídos — o mesmo denominador da tela da pesquisa,
    // contado na consulta e não por `_count` filtrado.
    prisma.surveyToken.groupBy({
      by: ["pesquisaId"],
      where: { pesquisa: { empresaId }, ...CONVITES_NA_PESQUISA },
      _count: { _all: true },
    }),
  ]);

  const convitesPorId = new Map(convitesPorPesquisa.map((g) => [g.pesquisaId, g._count._all]));
  const pesquisas = pesquisasBase.map((p) => ({
    ...p,
    _count: { ...p._count, tokens: convitesPorId.get(p.id) ?? 0 },
  }));

  // Nível geral das avaliações NR-01 (só quando há amostra suficiente).
  // Pesquisa FINISHED lê do cache gravado no encerramento (lib/nr01-cache.ts)
  // em vez de recalcular — é o único estado em que o resultado não muda mais.
  // ACTIVE/DRAFT seguem calculadas ao vivo, em paralelo entre pesquisas.
  const niveisEntries = await Promise.all(
    pesquisas.map(async (p) => {
      if (p._count.respostas === 0) return [p.id, null] as const;
      return [p.id, await nivelGeralComBackfill(p)] as const;
    }),
  );
  const niveisPorPesquisa = new Map<string, { nivel: keyof typeof NIVEIS_RISCO; indice: number } | null>(
    niveisEntries,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Relatórios — {empresa?.nome}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pesquisa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Convites</TableHead>
              <TableHead className="text-center">Respostas</TableHead>
              <TableHead className="text-center">Participação</TableHead>
              <TableHead className="text-center">Risco geral (NR-01)</TableHead>
              <TableHead className="text-right">Relatórios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pesquisas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma pesquisa nesta empresa ainda.
                </TableCell>
              </TableRow>
            )}
            {pesquisas.map((p) => {
              const nivel = niveisPorPesquisa.get(p.id) ?? null;
              const participacao = participacaoPct(p._count.respostas, p._count.tokens);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/rh/${empresaId}/pesquisas/${p.id}`} className="hover:underline">
                      {p.titulo}
                    </Link>
                    {p.modelo === "NR01" && (
                      <Badge variant="outline" className="ml-2">
                        NR-01
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{statusPesquisaLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{p._count.tokens}</TableCell>
                  <TableCell className="text-center">{p._count.respostas}</TableCell>
                  <TableCell className="text-center">{p._count.tokens > 0 ? `${participacao}%` : "—"}</TableCell>
                  <TableCell className="text-center">
                    {nivel ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: NIVEIS_RISCO[nivel.nivel].corBg, color: "#1f2937" }}
                      >
                        {NIVEIS_RISCO[nivel.nivel].label} ({nivel.indice}/100)
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.modelo === "NR01" && (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`/rh/${empresaId}/dashboard?pesquisa=${p.id}`} />}
                        >
                          <BarChart3 className="size-4" />
                          Dashboard
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <a
                              href={`/api/rh/${empresaId}/pesquisas/${p.id}/relatorio-pdf`}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          <FileDown className="size-4" />
                          PDF
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
