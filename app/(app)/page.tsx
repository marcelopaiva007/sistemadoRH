import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Briefcase, Building2, CheckCircle2, CircleDashed, Rocket, Users } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { pendenciasDaEmpresa, totalPendencias } from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Indicador } from "@/components/indicador";

// Tela inicial do grupo: quantas pessoas, o que está pendente e por onde
// entrar. Até 25/07/2026 esta página era um painel de pesquisa de clima
// ("pesquisas ativas", "convites enviados", "respostas recebidas") — resto de
// quando o sistema era só isso. Clima virou um módulo entre 26; os números do
// grupo aqui são de RH, e o detalhe de clima vive no painel da empresa.
export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");

  // RH_MANAGER: buscar apenas as empresas vinculadas a ele
  // ADMIN/DIRETORIA: buscar todas as empresas ativas
  const isRHManager = user.role === "RH_MANAGER";
  const empresasIds =
    isRHManager && Array.isArray(user.empresas) && user.empresas.length > 0
      ? user.empresas.map((e) => e.empresaId)
      : undefined;

  const empresas = await prisma.empresa.findMany({
    where: {
      ativo: true,
      ...(empresasIds ? { id: { in: empresasIds } } : {}),
    },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, marca: { select: { id: true, nome: true } } },
  });

  const resumos = await Promise.all(
    empresas.map(async (empresa) => {
      const [ativos, vagasAbertas, integracoesAbertas, pendencias] = await Promise.all([
        prisma.colaborador.count({ where: { empresaId: empresa.id, ativo: true } }),
        prisma.vaga.count({ where: { empresaId: empresa.id, status: "ABERTA" } }),
        prisma.checklistIntegracao.count({
          where: { empresaId: empresa.id, concluido: false, colaborador: { ativo: true } },
        }),
        pendenciasDaEmpresa([empresa.id]),
      ]);
      return { empresa, ativos, vagasAbertas, integracoesAbertas, pendencias };
    }),
  );

  // Os números somam por MARCA, não por CNPJ: é assim que a diretoria pensa o
  // grupo. O CNPJ continua sendo onde o dado vive (e de onde a folha sai), mas
  // ver "LM Telecom" partida em três linhas não ajuda ninguém a decidir nada.
  const porMarca = new Map<string, { nome: string; itens: typeof resumos }>();
  for (const r of resumos) {
    const chave = r.empresa.marca.id;
    const atual = porMarca.get(chave);
    if (atual) atual.itens.push(r);
    else porMarca.set(chave, { nome: r.empresa.marca.nome, itens: [r] });
  }
  const marcas = [...porMarca.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
        <Indicador variante="cartao" icone={<Users className="size-4" />} rotulo="Colaboradores ativos" valor={totalColaboradores} />
        <Indicador variante="cartao"
          icone={<AlertTriangle className="size-4" />}
          rotulo="Pendências"
          valor={totalPend}
          alerta={totalPend > 0}
        />
        <Indicador variante="cartao" icone={<Briefcase className="size-4" />} rotulo="Vagas abertas" valor={totalVagas} />
        <Indicador variante="cartao" icone={<Rocket className="size-4" />} rotulo="Integrações em aberto" valor={totalIntegracoes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {marcas.map((marca) => {
          const ativos = marca.itens.reduce((a, r) => a + r.ativos, 0);
          const vagasAbertas = marca.itens.reduce((a, r) => a + r.vagasAbertas, 0);
          const integracoesAbertas = marca.itens.reduce((a, r) => a + r.integracoesAbertas, 0);
          const pend = marca.itens.reduce((a, r) => a + totalPendencias(r.pendencias), 0);
          const varios = marca.itens.length > 1;
          // "Em dia" e "não tem ninguém cadastrado" davam a MESMA etiqueta
          // verde. Uma diz que o RH está com tudo em ordem; a outra, que a
          // empresa nem começou a ser alimentada — e ler a segunda como a
          // primeira é justamente o engano que faz uma empresa vazia passar
          // despercebida.
          const semCadastro = ativos === 0;

          const corpo = (
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-muted-foreground" />
                  {marca.nome}
                </CardTitle>
                {pend > 0 ? (
                  <Badge variant="destructive">{pend} pendência(s)</Badge>
                ) : semCadastro ? (
                  <Badge variant="outline" className="gap-1 text-muted-foreground font-normal">
                    <CircleDashed className="size-3" />
                    sem cadastro
                  </Badge>
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

                {/* Só abre por CNPJ quando há mais de um. Com um só, a quebra
                    repetiria o número de cima e não informaria nada. */}
                {varios && (
                  <div className="mt-3 space-y-1 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {marca.itens.length} CNPJs nesta marca:
                    </p>
                    {marca.itens.map((r) => (
                      <Link
                        key={r.empresa.id}
                        href={`/rh/${r.empresa.id}`}
                        className="flex items-baseline justify-between rounded px-1 py-0.5 text-sm hover:bg-accent"
                      >
                        <span>{r.empresa.nome}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.ativos}
                          {totalPendencias(r.pendencias) > 0 && (
                            <span className="text-destructive">
                              {" "}
                              · {totalPendencias(r.pendencias)} pend.
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {pend > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {(() => {
                      const soma = (campo: keyof (typeof marca.itens)[0]["pendencias"]) =>
                        marca.itens.reduce((a, r) => a + (r.pendencias[campo] as number), 0);
                      return [
                        soma("catPendente") > 0 && `${soma("catPendente")} CAT sem emitir`,
                        soma("aprovacoes") > 0 && `${soma("aprovacoes")} aguardando aprovação`,
                        soma("epiVencido") > 0 && `${soma("epiVencido")} EPI vencido`,
                        soma("asoVencendo") > 0 && `${soma("asoVencendo")} ASO vencendo`,
                        soma("certificadosVencendo") > 0 && `${soma("certificadosVencendo")} NR vencendo`,
                        soma("integracoesAtrasadas") > 0 && `${soma("integracoesAtrasadas")} integração atrasada`,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                    })()}
                  </p>
                )}
              </CardContent>
            </Card>
          );

          // Com um CNPJ só, o cartão inteiro entra na empresa — é o gesto que
          // já existia. Com vários, entrar "na marca" não significa nada: a
          // navegação passa a ser por CNPJ, na lista de dentro.
          return varios ? (
            <div key={marca.nome}>{corpo}</div>
          ) : (
            <Link key={marca.nome} href={`/rh/${marca.itens[0].empresa.id}`}>
              {corpo}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

