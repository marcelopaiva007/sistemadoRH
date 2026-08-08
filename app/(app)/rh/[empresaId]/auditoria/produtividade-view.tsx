"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Award, Info, Medal, Trophy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { ROLE_LABEL } from "@/lib/constants";
import { formatarData } from "@/lib/datas";
import {
  aplicarRanking,
  type LinhaProdutividadeDia,
  type ResumoProdutividadePessoa,
} from "@/lib/produtividade-rh-utils";

const JANELAS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 14, rotulo: "14 dias" },
  { dias: 30, rotulo: "30 dias" },
] as const;

type CampoOrdenacao =
  | "posicao"
  | "usuarioNome"
  | "diasComAtividade"
  | "totalAcoes"
  | "aprovados"
  | "reprovados";

const formatarHora = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);

export function ProdutividadeView({
  resumo,
  detalhe,
  diasUteis,
  janelaDias,
}: {
  resumo: ResumoProdutividadePessoa[];
  detalhe: LinhaProdutividadeDia[];
  diasUteis: number;
  janelaDias: 7 | 14 | 30;
}) {
  const { itensDaPagina: detalheNaPagina, ...paginacao } = usePaginacao(detalhe);

  const [ordenacao, setOrdenacao] = useState<{ campo: CampoOrdenacao; asc: boolean }>({
    campo: "posicao",
    asc: true,
  });

  const resumoComRanking = useMemo(() => aplicarRanking(resumo), [resumo]);

  const top3 = useMemo(() => {
    return resumoComRanking.filter((r) => r.totalAcoes > 0).slice(0, 3);
  }, [resumoComRanking]);

  const resumoOrdenado = useMemo(() => {
    const lista = [...resumoComRanking];
    const { campo, asc } = ordenacao;
    lista.sort((a, b) => {
      let res = 0;
      if (campo === "posicao") res = a.posicao - b.posicao;
      else if (campo === "usuarioNome") res = a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR");
      else res = (a[campo] as number) - (b[campo] as number);
      return asc ? res : -res;
    });
    return lista;
  }, [resumoComRanking, ordenacao]);

  const alternarOrdenacao = (campo: CampoOrdenacao) => {
    setOrdenacao((prev) => ({
      campo,
      asc: prev.campo === campo ? !prev.asc : campo === "usuarioNome" || campo === "posicao",
    }));
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          <b>Atividade não é a mesma coisa que trabalho.</b> O número aqui é quantas vezes a pessoa
          mexeu no sistema — reunião, ligação e papelada fora do sistema não aparecem. Use como ponto
          de partida para conversar, não como veredito sozinho.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Janela: últimos {janelaDias} dias corridos ({diasUteis} dia(s) útil(eis)).
        </p>
        <div className="flex gap-1">
          {JANELAS.map((j) => (
            <a
              key={j.dias}
              href={`?dias=${j.dias}`}
              className={
                j.dias === janelaDias
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {j.rotulo}
            </a>
          ))}
        </div>
      </div>

      {top3.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {top3[0] && (
            <Indicador
              rotulo="1º Lugar no Ranking"
              icone={<Trophy className="size-4 text-amber-500" />}
              valor={top3[0].usuarioNome}
              complemento={`${top3[0].totalAcoes} ação(ões) (${top3[0].aprovados} aprov. / ${top3[0].reprovados} reprov.)`}
            />
          )}
          {top3[1] && (
            <Indicador
              rotulo="2º Lugar no Ranking"
              icone={<Medal className="size-4 text-slate-400" />}
              valor={top3[1].usuarioNome}
              complemento={`${top3[1].totalAcoes} ação(ões) (${top3[1].aprovados} aprov. / ${top3[1].reprovados} reprov.)`}
            />
          )}
          {top3[2] && (
            <Indicador
              rotulo="3º Lugar no Ranking"
              icone={<Award className="size-4 text-amber-700" />}
              valor={top3[2].usuarioNome}
              complemento={`${top3[2].totalAcoes} ação(ões) (${top3[2].aprovados} aprov. / ${top3[2].reprovados} reprov.)`}
            />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ranking e resumo por pessoa</CardTitle>
          <CardDescription>
            Ranking ordenado pelo volume total de ações no período. Inclui quem está vinculado ao RH desta marca mesmo com zero atividade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resumo.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguém vinculado ao RH desta marca ainda.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("posicao")}
                        className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        # <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("usuarioNome")}
                        className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Pessoa <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("diasComAtividade")}
                        className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Dias com atividade <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("totalAcoes")}
                        className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Ações totais <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("aprovados")}
                        className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Aprovou <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => alternarOrdenacao("reprovados")}
                        className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                      >
                        Reprovou <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumoOrdenado.map((r) => (
                    <TableRow key={r.usuarioId}>
                      <TableCell className="text-center font-medium tabular-nums">
                        {r.totalAcoes > 0 && r.posicao === 1 ? (
                          <Badge variant="default" className="gap-1 font-semibold">
                            <Trophy className="size-3" />
                            1º
                          </Badge>
                        ) : r.totalAcoes > 0 && r.posicao === 2 ? (
                          <Badge variant="secondary" className="gap-1 font-semibold">
                            <Medal className="size-3" />
                            2º
                          </Badge>
                        ) : r.totalAcoes > 0 && r.posicao === 3 ? (
                          <Badge variant="outline" className="gap-1 font-semibold">
                            <Award className="size-3" />
                            3º
                          </Badge>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            {r.posicao}º
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.usuarioNome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.usuarioRole ? (ROLE_LABEL[r.usuarioRole] ?? r.usuarioRole) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.diasComAtividade === 0 ? (
                          <Badge variant="destructive">0 de {diasUteis}</Badge>
                        ) : (
                          `${r.diasComAtividade} de ${diasUteis}`
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalAcoes}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.aprovados}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.reprovados}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalhe por dia</CardTitle>
          <CardDescription>
            Só dias com pelo menos uma ação aparecem aqui — dia sem linha nenhuma para uma pessoa é
            dia sem atividade registrada, já contado no resumo acima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detalhe.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma atividade registrada nesta janela.
            </p>
          ) : (
            <>
              <div className="rounded-md border">
                <Table compacta>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead>Pessoa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                      <TableHead>Primeira ação</TableHead>
                      <TableHead>Última ação</TableHead>
                      <TableHead className="text-right">Aprovou</TableHead>
                      <TableHead className="text-right">Reprovou</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalheNaPagina.map((l) => (
                      <TableRow key={`${l.usuarioId}:${l.dia}`}>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {formatarData(new Date(`${l.dia}T00:00:00`))}
                        </TableCell>
                        <TableCell>{l.usuarioNome}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.totalAcoes}</TableCell>
                        <TableCell className="tabular-nums">{formatarHora(l.primeiraAcao)}</TableCell>
                        <TableCell className="tabular-nums">{formatarHora(l.ultimaAcao)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.aprovados}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.reprovados}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Paginacao
                  total={paginacao.total}
                  porPagina={paginacao.porPagina}
                  paginaAtual={paginacao.paginaAtual}
                  totalPaginas={paginacao.totalPaginas}
                  onMudarPagina={paginacao.irPara}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
