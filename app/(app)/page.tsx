import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Briefcase, Building2, CheckCircle2, Rocket, Users } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { pendenciasDaEmpresa, totalPendencias } from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Tela inicial do grupo: quantas pessoas, o que está pendente e por onde
// entrar. Até 25/07/2026 esta página era um painel de pesquisa de clima
// ("pesquisas ativas", "convites enviados", "respostas recebidas") — resto de
// quando o sistema era só isso. Clima virou um módulo entre 26; os números do
// grupo aqui são de RH, e o detalhe de clima vive no painel da empresa.
export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");

  const empresas = await prisma.empresa.findMany({
    where: {
      ativo: true,
      ...(user.role === "RH_MANAGER" && user.empresaId ? { id: user.empresaId } : {}),
    },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  const resumos = await Promise.all(
    empresas.map(async (empresa) => {
      const [ativos, vagasAbertas, integracoesAbertas, pendencias] = await Promise.all([
        prisma.colaborador.count({ where: { empresaId: empresa.id, ativo: true } }),
        prisma.vaga.count({ where: { empresaId: empresa.id, status: "ABERTA" } }),
        prisma.checklistIntegracao.count({
          where: { empresaId: empresa.id, concluido: false, colaborador: { ativo: true } },
        }),
        pendenciasDaEmpresa(empresa.id),
      ]);
      return { empresa, ativos, vagasAbertas, integracoesAbertas, pendencias };
    }),
  );

  const totalColaboradores = resumos.reduce((a, r) => a + r.ativos, 0);
  const totalVagas = resumos.reduce((a, r) => a + r.vagasAbertas, 0);
  const totalIntegracoes = resumos.reduce((a, r) => a + r.integracoesAbertas, 0);
  const totalPend = resumos.reduce((a, r) => a + totalPendencias(r.pendencias), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sistema de RH</h1>
        <p className="text-sm text-muted-foreground">
          {empresas.length > 1
            ? "Visão do grupo. Escolha uma empresa para entrar."
            : "Visão geral. Entre na empresa para operar."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icone={<Users className="size-4" />} rotulo="Colaboradores ativos" valor={totalColaboradores} />
        <Kpi
          icone={<AlertTriangle className="size-4" />}
          rotulo="Pendências"
          valor={totalPend}
          alerta={totalPend > 0}
        />
        <Kpi icone={<Briefcase className="size-4" />} rotulo="Vagas abertas" valor={totalVagas} />
        <Kpi icone={<Rocket className="size-4" />} rotulo="Integrações em aberto" valor={totalIntegracoes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {resumos.map(({ empresa, ativos, vagasAbertas, integracoesAbertas, pendencias }) => {
          const pend = totalPendencias(pendencias);
          return (
            <Link key={empresa.id} href={`/rh/${empresa.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-muted-foreground" />
                    {empresa.nome}
                  </CardTitle>
                  {pend > 0 ? (
                    <Badge variant="destructive">{pend} pendência(s)</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      em dia
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Colaboradores</dt>
                    <dd className="text-right font-medium tabular-nums">{ativos}</dd>
                    <dt className="text-muted-foreground">Vagas abertas</dt>
                    <dd className="text-right font-medium tabular-nums">{vagasAbertas}</dd>
                    <dt className="text-muted-foreground">Integrações em aberto</dt>
                    <dd className="text-right font-medium tabular-nums">{integracoesAbertas}</dd>
                  </dl>
                  {pend > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {[
                        pendencias.catPendente > 0 && `${pendencias.catPendente} CAT sem emitir`,
                        pendencias.aprovacoes > 0 && `${pendencias.aprovacoes} aguardando aprovação`,
                        pendencias.epiVencido > 0 && `${pendencias.epiVencido} EPI vencido`,
                        pendencias.asoVencendo > 0 && `${pendencias.asoVencendo} ASO vencendo`,
                        pendencias.certificadosVencendo > 0 && `${pendencias.certificadosVencendo} NR vencendo`,
                        pendencias.integracoesAtrasadas > 0 && `${pendencias.integracoesAtrasadas} integração atrasada`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  icone,
  rotulo,
  valor,
  alerta,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          {icone}
          {rotulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
