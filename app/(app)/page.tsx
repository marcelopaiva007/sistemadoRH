import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Building2, CheckCircle2, CircleDashed, Rocket, Users } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { prisma } from "@/lib/prisma";
import {
  pendenciasPorEmpresa,
  empresasComRegistro,
  porNatureza,
  semRegistroNoEscopo,
  totalPendencias,
  zeradas,
  ROTULOS_PENDENCIA,
  type Pendencias,
} from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Indicador } from "@/components/indicador";
import { primeiroNome, saudacao } from "@/lib/saudacao";
import { PendenciasIndicador } from "./pendencias-indicador";

// Tela inicial do grupo: quantas pessoas, o que está pendente e por onde
// entrar. Até 25/07/2026 esta página era um painel de pesquisa de clima
// ("pesquisas ativas", "convites enviados", "respostas recebidas") — resto de
// quando o sistema era só isso. Clima virou um módulo entre 26; os números do
// grupo aqui são de RH, e o detalhe de clima vive no painel da empresa.
export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "GESTOR_SETOR") redirect("/rh/meu-setor");

  // Esta home é o painel de GRUPO do RH (colaboradores, pendências, folha).
  // Quem tem um perfil "só Processos" não pode vê-la: vai para o sistema dele.
  // Destino nunca é "/" (seria loop) nem depende do módulo — /conta é sempre
  // acessível. Sem perfil, o fallback de papel dá os dois sistemas, então isto
  // não muda nada para ninguém logado hoje.
  const sistemas = await sistemasPermitidos(user);
  if (!sistemas.includes("rh")) redirect(sistemas.includes("processos") ? "/processos" : "/conta");

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

  // Tudo agregado de uma vez, não uma rodada de queries por empresa: são 5
  // idas ao banco no total (3 aqui + 1 em pendenciasPorEmpresa + 1 em
  // empresasComRegistro), quantas empresas forem. Eram 52 até 04/09/2026 —
  // 28 + 21 `groupBy` em paralelo, que entravam em fila no pool de 5 conexões
  // e seguravam esta tela por 2 a 5 s —, e antes disso 11 POR empresa: com os
  // 11 CNPJs do grupo passava de 120, e esta é a primeira tela depois do login.
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
  // As 27 pendências separadas por natureza (lib/pendencias.ts). O total
  // continua existindo — a soma por marca, os cartões e o popover seguem
  // usando ele —, mas o TOPO da tela passa a mostrar os três grupos, porque
  // "6 documentos esperando conferência" e "163 cadastros incompletos" não
  // pedem a mesma coisa de quem abriu o sistema.
  const naturezas = resumos.reduce(
    (acc, r) => {
      const n = porNatureza(r.pendencias);
      return {
        decidir: acc.decidir + n.decidir,
        prazo: acc.prazo + n.prazo,
        cadastro: acc.cadastro + n.cadastro,
      };
    },
    { decidir: 0, prazo: 0, cadastro: 0 },
  );

  // Resumo por marca calculado uma vez só, fora do JSX: o card de cada marca e
  // o link do indicador "Pendências" do topo precisam do mesmo número.
  const marcasComResumo = marcas.map((marca) => {
    const pend = marca.itens.reduce((a, r) => a + totalPendencias(r.pendencias), 0);
    const semBase = semRegistroNoEscopo(
      comRegistro,
      marca.itens.map((r) => r.empresa.id),
    ).size;
    // Por natureza também, e não só o total: cada um dos três cartões do topo
    // abre a MESMA lista de marcas, e ela precisa mostrar o número DAQUELE
    // grupo. Sem isto o cartão diz "6" e a lista embaixo dele diz "169" — a
    // contradição que esta tela existe para acabar.
    const natureza = marca.itens.reduce(
      (acc, r) => {
        const n = porNatureza(r.pendencias);
        return {
          decidir: acc.decidir + n.decidir,
          prazo: acc.prazo + n.prazo,
          cadastro: acc.cadastro + n.cadastro,
        };
      },
      { decidir: 0, prazo: 0, cadastro: 0 },
    );
    // IDs de todas as empresas nesta marca, para o link do popover manter
    // consistência com os números do cartão. Sem isto, o cartão diz "6
    // Esperando decisão" mas a lista abre com números diferentes.
    const empresasIds = marca.itens.map((r) => r.empresa.id);

    return {
      marca,
      ativos: marca.itens.reduce((a, r) => a + r.ativos, 0),
      vagasAbertas: marca.itens.reduce((a, r) => a + r.vagasAbertas, 0),
      integracoesAbertas: marca.itens.reduce((a, r) => a + r.integracoesAbertas, 0),
      pend,
      natureza,
      semCadastro: marca.itens.reduce((a, r) => a + r.ativos, 0) === 0,
      semBase,
      // Visão consolidada da marca (mesmo padrão do organograma). Qualquer
      // CNPJ serve de ponto de entrada — a tela de empresa soma por marca por
      // padrão. Quem clica num CNPJ específico da lista abaixo (ver
      // `hrefCnpj`) entra já filtrado só naquele CNPJ via `?empresas=`.
      // O link aqui TAMBÉM passa `?empresas=` com a marca inteira, para que o
      // popover (que mostra números da marca) abra a tela já filtrada para a marca.
      href: `/rh/${marca.itens[0].empresa.id}?empresas=${empresasIds.join(",")}#pendencias`,
    };
  });

  // Itens do popover de cada indicador do topo: só as marcas que têm algo
  // NAQUELE grupo, cada uma já com o link pronto pra tela de resolução. Uma
  // lista por grupo, e não uma lista do total para os três — o número da lista
  // tem que fechar com o número do cartão que a abriu.
  const marcasNo = (grupo: "decidir" | "prazo" | "cadastro") =>
    marcasComResumo
      .filter((m) => m.natureza[grupo] > 0)
      .map((m) => ({ nome: m.marca.nome, pend: m.natureza[grupo], href: m.href }));

  return (
    <div className="space-y-6">
      {/* O cabeçalho diz o que espera ESTA pessoa hoje, e não o nome do
          sistema (que já está na barra de cima). Antes era "Sistema de RH /
          Visão do grupo" — uma legenda: verdadeira, e inútil para decidir o
          que fazer no primeiro minuto depois do login. */}
      <div>
        <h1>
          {saudacao()}
          {primeiroNome(user.name) ? `, ${primeiroNome(user.name)}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {naturezas.decidir > 0 ? (
            <>
              <strong className="text-foreground">
                {naturezas.decidir}{" "}
                {naturezas.decidir === 1 ? "item espera" : "itens esperam"} sua decisão
              </strong>{" "}
              — aprovações, ajustes de ponto, documentos, mensagens do portal,
              disciplinares e CAT a emitir.
            </>
          ) : (
            <>
              Nada esperando decisão do RH agora.
              {empresas.length > 1 ? " Escolha uma empresa para entrar." : ""}
            </>
          )}
        </p>
      </div>

      {/* Três grupos, não um número só: "decidir" é fila do dia (gente
          esperando), "prazo" é data correndo contra, "cadastro" é qualidade de
          base sem data fatal. Somados, eram o mesmo "Pendências" de antes —
          e o item acionável sumia dentro do maior. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <PendenciasIndicador
          rotulo="Esperando sua decisão"
          total={naturezas.decidir}
          itens={marcasNo("decidir")}
          destaque
        />
        <PendenciasIndicador
          rotulo="Prazo correndo"
          total={naturezas.prazo}
          itens={marcasNo("prazo")}
        />
        <PendenciasIndicador
          rotulo="Cadastro a completar"
          total={naturezas.cadastro}
          itens={marcasNo("cadastro")}
          neutro
        />
      </div>

      {/* Os números de contexto descem de posição, de propósito: quantos
          colaboradores o grupo tem não muda o que se faz agora. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador icone={<Users className="size-4" />} rotulo="Colaboradores ativos" valor={totalColaboradores} />
        <Indicador icone={<Briefcase className="size-4" />} rotulo="Vagas abertas" valor={totalVagas} />
        <Indicador icone={<Rocket className="size-4" />} rotulo="Integrações em aberto" valor={totalIntegracoes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {marcasComResumo.map(
          ({ marca, ativos, vagasAbertas, integracoesAbertas, pend, semCadastro, semBase, href }) => {
            const varios = marca.itens.length > 1;

            // O card inteiro já foi um único <Link> (marca inteira), mas isso
            // escondia o CNPJ atrás do primeiro da lista — quem clicava em
            // "RSM TELECOM LTDA · 19 pend." caía numa tela somada com os
            // outros CNPJs da marca, sem bater com o número que via aqui.
            // Agora o cabeçalho/resumo continuam um Link só (visão da marca),
            // e cada linha de CNPJ é o SEU PRÓPRIO Link, filtrado por
            // `?empresas=` (mesmo filtro de Férias/Vencimentos/Aprovações) —
            // não pode ficar aninhado dentro do Link de cima, então os dois
            // são irmãos dentro do Card, não um dentro do outro.
            return (
              <Card key={marca.nome} className="h-full">
                <Link href={href} className="block transition-colors hover:bg-accent/40">
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

                    {pend > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {(() => {
                          // TODAS as chaves, não uma lista fixa: a versão
                          // anterior enumerava 6 e uma marca cujas pendências
                          // eram só dos outros tipos mostrava o badge "N
                          // pendência(s)" seguido de um parágrafo vazio. As
                          // três maiores explicam o número; o resto vira "+ n".
                          const somas = (Object.keys(ROTULOS_PENDENCIA) as (keyof Pendencias)[])
                            .map((chave) => ({
                              chave,
                              n: marca.itens.reduce((a, r) => a + r.pendencias[chave], 0),
                            }))
                            .filter((s) => s.n > 0)
                            .sort((a, b) => b.n - a.n);
                          const topo = somas
                            .slice(0, 3)
                            .map((s) => `${s.n} ${ROTULOS_PENDENCIA[s.chave]}`)
                            .join(" · ");
                          const resto = somas.length - 3;
                          return resto > 0
                            ? `${topo} · +${resto} ${resto === 1 ? "situação" : "situações"}`
                            : topo;
                        })()}
                      </p>
                    )}
                  </CardContent>
                </Link>

                {/* Só abre por CNPJ quando há mais de um. Com um só, a quebra
                    repetiria o número de cima e não informaria nada. */}
                {varios && (
                  <CardContent className="space-y-1 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {marca.itens.length} CNPJs nesta marca:
                    </p>
                    {marca.itens.map((r) => (
                      <Link
                        key={r.empresa.id}
                        href={`/rh/${r.empresa.id}?empresas=${r.empresa.id}#pendencias`}
                        className="flex items-baseline justify-between rounded px-1 py-0.5 text-sm transition-colors hover:bg-accent/40"
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
                  </CardContent>
                )}
              </Card>
            );
          },
        )}
      </div>
    </div>
  );
}

