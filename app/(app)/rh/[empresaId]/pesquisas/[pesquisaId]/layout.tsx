import { notFound } from "next/navigation";
import { BarChart3, FileDown } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Trilha } from "@/components/trilha";
import { AcoesPesquisa } from "./acoes-pesquisa";
import { AbasDaPesquisa } from "./abas-da-pesquisa";
import Link from "next/link";

/**
 * Cabeçalho comum das telas da pesquisa.
 *
 * Até 28/07/2026 tudo — dados, as 35 perguntas, os 205 convites e os gráficos
 * — era uma tela só: rolagem sem fim e a lista inteira de convidados carregada
 * para quem só queria ver a média por setor. Agora são quatro rotas irmãs, e
 * cada uma busca apenas o que mostra; este layout carrega o que é comum (o
 * título, o status e a contagem das abas).
 */
export default async function PesquisaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId },
    select: {
      id: true,
      titulo: true,
      status: true,
      modelo: true,
      _count: {
        select: { perguntas: true, respostas: true },
      },
    },
  });
  if (!pesquisa) notFound();

  const convites = await prisma.surveyToken.count({
    where: { pesquisaId, ...CONVITES_NA_PESQUISA },
  });

  return (
    <div className="space-y-6">
      {/* No layout, não em cada page: as quatro rotas irmãs (dados, perguntas,
          convites, resultados) precisam da mesma volta, e o AbasDaPesquisa
          logo abaixo já diz em qual delas se está. Até 11/08/2026 essas telas
          eram as únicas do sistema sem NENHUM caminho de volta. */}
      <Trilha empresaId={empresaId} atual={pesquisa.titulo} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1>{pesquisa.titulo}</h1>
        <AcoesPesquisa empresaId={empresaId} pesquisaId={pesquisa.id} status={pesquisa.status} />
      </div>

      {pesquisa.modelo === "NR01" && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Avaliação de Riscos Psicossociais (NR-01/PGR) — perguntas fixas, escala 0 (Nunca) a
              4 (Sempre). Resultados na matriz de risco do Dashboard e no relatório técnico em PDF.
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                render={<a href={`/rh/${empresaId}/dashboard?pesquisa=${pesquisa.id}`} />}
              >
                <BarChart3 className="size-4" />
                Dashboard
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={
                  <a
                    href={`/api/rh/${empresaId}/pesquisas/${pesquisa.id}/relatorio-pdf`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <FileDown className="size-4" />
                Relatório PDF (PGR)
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {pesquisa.modelo === "CLIMA" && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Pesquisa de Clima Organizacional (GPTW) — dimensões Credibilidade, Respeito,
              Imparcialidade, Orgulho, Camaradagem e NPS.
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/rh/${empresaId}/pesquisas/${pesquisa.id}/dashboard-clima`} />}
              >
                <BarChart3 className="size-4" />
                Dashboard
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={
                  <a
                    href={`/api/rh/${empresaId}/pesquisas/${pesquisa.id}/relatorio-clima-pdf`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <FileDown className="size-4" />
                Relatório PDF
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      <AbasDaPesquisa
        base={`/rh/${empresaId}/pesquisas/${pesquisa.id}`}
        perguntas={pesquisa._count.perguntas}
        convites={convites}
        respostas={pesquisa._count.respostas}
      />

      {children}
    </div>
  );
}
