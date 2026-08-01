import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { CONVITES_NA_PESQUISA, participacaoPct } from "@/lib/pesquisa-numeros";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DadosPesquisaForm } from "./dados-pesquisa-form";

// Visão geral: os dados da campanha e o placar. Nada de lista — quem quer a
// lista abre a aba Convites, e é lá que os 205 registros são carregados.
export default async function PesquisaVisaoGeralPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId: { in: await empresasDaMesmaMarca(empresaId) } },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      anonima: true,
      status: true,
      modelo: true,
      _count: { select: { respostas: true } },
    },
  });
  if (!pesquisa) notFound();

  const [convites, enviados, cadastrados, semConvite] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    // Enviado conta por enviadoEm, não por status: o status vira RESPONDED
    // quando a pessoa responde, e por status os respondentes sumiriam da conta.
    prisma.surveyToken.count({
      where: { pesquisaId, ...CONVITES_NA_PESQUISA, enviadoEm: { not: null } },
    }),
    prisma.colaborador.count({ where: { empresaId, ativo: true } }),
    prisma.colaborador.count({
      where: { empresaId, ativo: true, tokens: { none: { pesquisaId } } },
    }),
  ]);

  const respostas = pesquisa._count.respostas;

  const numeros = [
    {
      rotulo: "Colaboradores cadastrados",
      valor: cadastrados,
      apoio: semConvite > 0 ? `${semConvite} ainda sem convite` : "todos com convite",
    },
    { rotulo: "Na pesquisa", valor: convites, apoio: "convites válidos" },
    {
      rotulo: "Convites enviados",
      valor: enviados,
      apoio: `${convites - enviados} ainda não enviado(s)`,
    },
    {
      rotulo: "Respostas",
      valor: respostas,
      apoio: `${participacaoPct(respostas, convites)}% de participação`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {numeros.map((n) => (
          <Card key={n.rotulo}>
            <CardContent className="space-y-1 py-4">
              <p className="text-xs text-muted-foreground">{n.rotulo}</p>
              <p className="text-2xl font-semibold tabular-nums">{n.valor}</p>
              <p className="text-xs text-muted-foreground">{n.apoio}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <DadosPesquisaForm empresaId={empresaId} pesquisa={pesquisa} />
        </CardContent>
      </Card>
    </div>
  );
}
