import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, HeartHandshake, Send, BarChart3, FileDown } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularNR01, NIVEIS_RISCO, type NivelRisco } from "@/lib/nr01";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Página inicial: visão geral do sistema. ADMIN/DIRETORIA veem todas as
// empresas; RH_MANAGER só a sua; GESTOR_SETOR vai direto para o seu setor.
// Os números de pesquisa continuam sempre por empresa — nunca misturados.
export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");

  const empresas = await prisma.empresa.findMany({
    where: {
      ativo: true,
      ...(user.role === "RH_MANAGER" && user.empresaId ? { id: user.empresaId } : {}),
    },
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { colaboradores: true, setores: true } },
    },
  });

  const resumos = await Promise.all(
    empresas.map(async (empresa) => {
      const [ativos, vinculadosTelegram, pesquisaNR01] = await Promise.all([
        prisma.colaborador.count({ where: { empresaId: empresa.id, ativo: true } }),
        prisma.colaborador.count({
          where: { empresaId: empresa.id, ativo: true, telegramChatId: { not: null } },
        }),
        prisma.pesquisa.findFirst({
          where: { empresaId: empresa.id, modelo: "NR01" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            titulo: true,
            status: true,
            _count: { select: { tokens: true, respostas: true } },
          },
        }),
      ]);

      let enviados = 0;
      let nivelNR01: { nivel: NivelRisco; indice: number } | null = null;
      if (pesquisaNR01) {
        enviados = await prisma.surveyToken.count({
          where: { pesquisaId: pesquisaNR01.id, status: { in: ["SENT", "RESPONDED"] } },
        });
        if (pesquisaNR01._count.respostas > 0) {
          const [perguntas, respostas] = await Promise.all([
            prisma.pergunta.findMany({
              where: { pesquisaId: pesquisaNR01.id },
              select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
            }),
            prisma.resposta.findMany({
              where: { pesquisaId: pesquisaNR01.id },
              select: {
                setorNomeSnapshot: true,
                posicaoNomeSnapshot: true,
                itens: { select: { perguntaId: true, valorNumerico: true } },
              },
            }),
          ]);
          const resultado = calcularNR01(perguntas, respostas);
          if (!resultado.geral.amostraInsuficiente) {
            nivelNR01 = {
              nivel: resultado.geral.nivelGeral,
              indice: Math.round(resultado.geral.indiceGeral100),
            };
          }
        }
      }

      return { empresa, ativos, vinculadosTelegram, pesquisaNR01, enviados, nivelNR01 };
    }),
  );

  const totalColaboradores = resumos.reduce((a, r) => a + r.ativos, 0);
  const totalEnviados = resumos.reduce((a, r) => a + r.enviados, 0);
  const totalRespostas = resumos.reduce((a, r) => a + (r.pesquisaNR01?._count.respostas ?? 0), 0);
  const pesquisasAtivas = resumos.filter((r) => r.pesquisaNR01?.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Visão geral</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icone={<Users className="size-4" />} rotulo="Colaboradores ativos" valor={String(totalColaboradores)} />
        <KpiCard icone={<HeartHandshake className="size-4" />} rotulo="Pesquisas ativas" valor={String(pesquisasAtivas)} />
        <KpiCard icone={<Send className="size-4" />} rotulo="Convites enviados" valor={String(totalEnviados)} />
        <KpiCard icone={<BarChart3 className="size-4" />} rotulo="Respostas recebidas" valor={String(totalRespostas)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {resumos.map(({ empresa, ativos, vinculadosTelegram, pesquisaNR01, enviados, nivelNR01 }) => {
          const participacao =
            pesquisaNR01 && pesquisaNR01._count.tokens > 0
              ? Math.round((pesquisaNR01._count.respostas / pesquisaNR01._count.tokens) * 100)
              : null;
          return (
            <Card key={empresa.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{empresa.nome}</CardTitle>
                {nivelNR01 && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: NIVEIS_RISCO[nivelNR01.nivel].corBg, color: "#1f2937" }}
                    title={`Risco psicossocial geral (NR-01): índice ${nivelNR01.indice}/100`}
                  >
                    NR-01: {NIVEIS_RISCO[nivelNR01.nivel].label}
                  </span>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Colaboradores ativos</dt>
                  <dd className="text-right font-medium">{ativos}</dd>
                  <dt className="text-muted-foreground">Telegram vinculado</dt>
                  <dd className="text-right font-medium">{vinculadosTelegram}</dd>
                  {pesquisaNR01 && (
                    <>
                      <dt className="text-muted-foreground">Convites enviados</dt>
                      <dd className="text-right font-medium">
                        {enviados}/{pesquisaNR01._count.tokens}
                      </dd>
                      <dt className="text-muted-foreground">Respostas</dt>
                      <dd className="text-right font-medium">
                        {pesquisaNR01._count.respostas}
                        {participacao !== null ? ` (${participacao}%)` : ""}
                      </dd>
                    </>
                  )}
                </dl>
                {pesquisaNR01 ? (
                  <p className="text-xs text-muted-foreground">
                    {pesquisaNR01.titulo} —{" "}
                    <Badge variant="secondary">{pesquisaNR01.status === "ACTIVE" ? "Ativa" : pesquisaNR01.status}</Badge>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem avaliação NR-01 criada ainda.</p>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" render={<Link href={`/rh/${empresa.id}/dashboard`} />}>
                    <BarChart3 className="size-4" />
                    Dashboard
                  </Button>
                  <Button variant="outline" size="sm" render={<Link href={`/rh/${empresa.id}/pesquisas`} />}>
                    <HeartHandshake className="size-4" />
                    Pesquisas
                  </Button>
                  <Button variant="outline" size="sm" render={<Link href={`/rh/${empresa.id}/colaboradores`} />}>
                    <Users className="size-4" />
                    Colaboradores
                  </Button>
                  {pesquisaNR01 && (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <a
                          href={`/api/rh/${empresa.id}/pesquisas/${pesquisaNR01.id}/relatorio-pdf`}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <FileDown className="size-4" />
                      PDF
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          {icone}
          {rotulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{valor}</p>
      </CardContent>
    </Card>
  );
}
