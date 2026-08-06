import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Building2, CheckCircle2, CircleDashed, Rocket, Users } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  pendenciasPorEmpresa,
  empresasComRegistro,
  semRegistroNoEscopo,
  totalPendencias,
  zeradas,
} from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Indicador } from "@/components/indicador";
import { PendenciasIndicador } from "./pendencias-indicador";

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

  // Tudo agregado de uma vez, não uma rodada de queries por empresa: são 33
  // idas ao banco no total (3 aqui + 18 em pendenciasPorEmpresa + 12 em
  // empresasComRegistro), quantas empresas forem. O laço anterior fazia 11 POR
  // empresa — com os 11 CNPJs do grupo passava de 120, e esta é a primeira
  // tela depois do login.
  const ids = empresas.map((e) => e.id);
  const [ativosPorEmpresa, vagasPorEmpresa, integracoesPorEmpresa, pendenciasPorId, comRegistro] =
    await Promise.all([
      prisma.colaborador.groupBy({
        by: ["empresaId"],
        _count: { _all: true },
        where: { empresaId: { in: ids }, ativo: true },
      }),
      prisma.vaga.groupBy({
        by: ["empresaId"],
        _count: { _all: true },
        where: { empresaId: { in: ids }, status: "ABERTA" },
      }),
      prisma.checklistIntegracao.groupBy({
        by: ["empresaId"],
        _count: { _all: true },
        where: { empresaId: { in: ids }, concluido: false, colaborador: { ativo: true } },
      }),
      pendenciasPorEmpresa(ids),
      // Para a etiqueta da marca não dizer "em dia" sobre módulo que ninguém
      // abriu — mesmo engano que a tela da empresa tinha, só que aqui é a
      // primeira coisa que se vê depois do login.
      empresasComRegistro(ids),
    ]);

  // Empresa sem registro nenhum não volta no groupBy — daí o `?? 0`.
  const contagem = (linhas: { empresaId: string; _count?: { _all?: number } }[]) =>
    new Map(linhas.map((l) => [l.empresaId, l._count?._all ?? 0]));
  const ativosPorId = contagem(ativosPorEmpresa);
  const vagasPorId = contagem(vagasPorEmpresa);
  const integracoesPorId = contagem(integracoesPorEmpresa);

  const resumos = empresas.map((empresa) => ({
    empresa,
    ativos: ativosPorId.get(empresa.id) ?? 0,
    vagasAbertas: vagasPorId.get(empresa.id) ?? 0,
    integracoesAbertas: integracoesPorId.get(empresa.id) ?? 0,
    pendencias: pendenciasPorId.get(empresa.id) ?? zeradas(),
  }));

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

  // Resumo por marca calculado uma vez só, fora do JSX: o card de cada marca e
  // o link do indicador "Pendências" do topo precisam do mesmo número.
  const marcasComResumo = marcas.map((marca) => {
    const pend = marca.itens.reduce((a, r) => a + totalPendencias(r.pendencias), 0);
    const semBase = semRegistroNoEscopo(
      comRegistro,
      marca.itens.map((r) => r.empresa.id),
    ).size;
    return {
      marca,
      ativos: marca.itens.reduce((a, r) => a + r.ativos, 0),
      vagasAbertas: marca.itens.reduce((a, r) => a + r.vagasAbertas, 0),
      integracoesAbertas: marca.itens.reduce((a, r) => a + r.integracoesAbertas, 0),
      pend,
      semCadastro: marca.itens.reduce((a, r) => a + r.ativos, 0) === 0,
      semBase,
      // Entrar por qualquer CNPJ da marca mostra a mesma tela — a página de
      // empresa soma por marca (ver empresasDaMesmaMarca). Não existe "o CNPJ
      // errado" para este link.
      href: `/rh/${marca.itens[0].empresa.id}#pendencias`,
    };
  });

  // Itens do popover do indicador "Pendências" do topo: só as marcas que têm
  // algo pendente, cada uma já com o link pronto pra tela de resolução.
  const marcasComPendencia = marcasComResumo
    .filter((m) => m.pend > 0)
    .map((m) => ({ nome: m.marca.nome, pend: m.pend, href: m.href }));

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
        <PendenciasIndicador total={totalPend} itens={marcasComPendencia} />
        <Indicador variante="cartao" icone={<Briefcase className="size-4" />} rotulo="Vagas abertas" valor={totalVagas} />
        <Indicador variante="cartao" icone={<Rocket className="size-4" />} rotulo="Integrações em aberto" valor={totalIntegracoes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {marcasComResumo.map(
          ({ marca, ativos, vagasAbertas, integracoesAbertas, pend, semCadastro, semBase, href }) => {
            const varios = marca.itens.length > 1;

            // O cartão inteiro é um link — inclusive quando há vários CNPJs.
            // Antes, com vários, só as linhas de CNPJ dentro do cartão eram
            // clicáveis, e para qualquer coisa fora delas (o cabeçalho, o
            // resumo, o "pend :" de baixo) o clique não ia a lugar nenhum; a
            // pessoa reportou isso como bug. Entrar por qualquer CNPJ da marca
            // mostra a mesma tela (soma por marca, não por CNPJ — ver
            // empresasDaMesmaMarca), então não existe "CNPJ errado" para
            // linkar, e as linhas de baixo não precisam mais ser links à
            // parte — um <a> dentro de outro <a> nem seria HTML válido.
            return (
              <Link key={marca.nome} href={href} className="block h-full">
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
                    ) : semBase > 0 ? (
                      <Badge
                        variant="outline"
                        className="gap-1 font-normal text-muted-foreground"
                        title={`${semBase} das situações acompanhadas não têm nenhum registro — o zero não é conformidade.`}
                      >
                        <CircleDashed className="size-3" />
                        {semBase} sem base
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
                          <div
                            key={r.empresa.id}
                            className="flex items-baseline justify-between px-1 py-0.5 text-sm"
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
                          </div>
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
              </Link>
            );
          },
        )}
      </div>
    </div>
  );
}

