"use client";

import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { ROLE_LABEL } from "@/lib/constants";
import { formatarData } from "@/lib/datas";
import type { LinhaProdutividadeDia, ResumoProdutividadePessoa } from "@/lib/produtividade-rh";

const JANELAS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 14, rotulo: "14 dias" },
  { dias: 30, rotulo: "30 dias" },
] as const;

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

      <Card>
        <CardHeader>
          <CardTitle>Resumo por pessoa</CardTitle>
          <CardDescription>
            Inclui quem está vinculado ao RH desta marca mesmo com zero atividade — é o caso que mais
            importa aparecer, não esconder.
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
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="text-right">Dias com atividade</TableHead>
                    <TableHead className="text-right">Ações totais</TableHead>
                    <TableHead className="text-right">Aprovou</TableHead>
                    <TableHead className="text-right">Reprovou</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumo.map((r) => (
                    <TableRow key={r.usuarioId}>
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
