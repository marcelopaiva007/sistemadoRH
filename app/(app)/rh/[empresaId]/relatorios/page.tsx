import Link from "next/link";
import { FileDown, BarChart3 } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularNR01, NIVEIS_RISCO } from "@/lib/nr01";
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

  const [empresa, pesquisas] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nome: true } }),
    prisma.pesquisa.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tokens: true, respostas: true } } },
    }),
  ]);

  // Nível geral das avaliações NR-01 (só quando há amostra suficiente).
  const niveisPorPesquisa = new Map<string, { nivel: keyof typeof NIVEIS_RISCO; indice: number } | null>();
  for (const p of pesquisas) {
    if (p.modelo !== "NR01" || p._count.respostas === 0) {
      niveisPorPesquisa.set(p.id, null);
      continue;
    }
    const [perguntas, respostas] = await Promise.all([
      prisma.pergunta.findMany({
        where: { pesquisaId: p.id },
        select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
      }),
      prisma.resposta.findMany({
        where: { pesquisaId: p.id },
        select: {
          setorNomeSnapshot: true,
          posicaoNomeSnapshot: true,
          itens: { select: { perguntaId: true, valorNumerico: true } },
        },
      }),
    ]);
    const resultado = calcularNR01(perguntas, respostas);
    niveisPorPesquisa.set(
      p.id,
      resultado.geral.amostraInsuficiente
        ? null
        : { nivel: resultado.geral.nivelGeral, indice: Math.round(resultado.geral.indiceGeral100) },
    );
  }

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
              const participacao =
                p._count.tokens > 0 ? Math.round((p._count.respostas / p._count.tokens) * 100) : 0;
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
