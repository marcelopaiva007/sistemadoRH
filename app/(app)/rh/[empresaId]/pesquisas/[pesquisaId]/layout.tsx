import { notFound } from "next/navigation";
import { BarChart3, FileDown } from "lucide-react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AcoesPesquisa } from "./acoes-pesquisa";
import { AbasDaPesquisa } from "./abas-da-pesquisa";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{pesquisa.titulo}</h2>
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
