"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Indicador } from "@/components/indicador";
import { STATUS_PERIODO_LABEL, type StatusPeriodo } from "@/lib/ferias";
import { formatarData } from "@/lib/datas";
import type { LinhaFerias } from "./page";

const FILTROS = [
  { chave: "TODOS", rotulo: "Todos" },
  { chave: "VENCIDO", rotulo: "Vencidas" },
  { chave: "VENCENDO", rotulo: "Vencendo" },
  { chave: "DISPONIVEL", rotulo: "Disponíveis" },
  { chave: "SEM_HISTORICO", rotulo: "Sem histórico" },
] as const;

type Filtro = (typeof FILTROS)[number]["chave"];

const VARIANTE: Record<StatusPeriodo, "default" | "secondary" | "destructive" | "outline"> = {
  EM_CURSO: "outline",
  DISPONIVEL: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  CONCLUIDO: "outline",
};

export function FeriasView({
  empresaId,
  linhas,
  semAdmissao,
}: {
  empresaId: string;
  linhas: LinhaFerias[];
  semAdmissao: number;
}) {
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busca, setBusca] = useState("");

  const contagem = useMemo(() => {
    const conta = (s: StatusPeriodo) =>
      linhas.filter((l) => l.periodo?.status === s && !l.semHistorico).length;
    return {
      vencidas: conta("VENCIDO"),
      vencendo: conta("VENCENDO"),
      disponiveis: conta("DISPONIVEL"),
      semHistorico: linhas.filter((l) => l.semHistorico).length,
    };
  }, [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter((l) => {
        if (filtro === "SEM_HISTORICO") return l.semHistorico;
        if (filtro !== "TODOS") return l.periodo?.status === filtro && !l.semHistorico;
        return true;
      })
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo) || l.setor.toLowerCase().includes(termo))
      .sort((a, b) => {
        const da = a.periodo?.diasAteLimite ?? Number.MAX_SAFE_INTEGER;
        const db = b.periodo?.diasAteLimite ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
  }, [linhas, filtro, busca]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Férias</h2>
        <p className="text-sm text-muted-foreground">
          Quem tem férias a vencer, vencidas ou saldo disponível. O prazo de gozo é de 12 meses após o
          fim do período aquisitivo — passando disso o pagamento é em dobro (CLT art. 137).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Vencidas" valor={contagem.vencidas} alerta={contagem.vencidas > 0} />
        <Indicador
          rotulo="Vencendo em 90 dias"
          valor={contagem.vencendo}
          atencao={contagem.vencendo > 0}
        />
        <Indicador rotulo="Com saldo disponível" valor={contagem.disponiveis} />
        <Indicador
          rotulo="Sem histórico"
          valor={contagem.semHistorico}
          complemento="conferir antes de cobrar"
          atencao={contagem.semHistorico > 0}
        />
      </div>

      {contagem.semHistorico > 0 && (
        <Alert>
          <AlertDescription>
            <b>{contagem.semHistorico} colaborador(es) não têm nenhuma férias registrada</b> e já
            passaram do primeiro período aquisitivo. Quase sempre é buraco de cadastro, não alguém que
            nunca saiu de férias — a base foi importada sem o histórico de gozo. Enquanto não forem
            conferidos, esses não entram na conta de vencidas. Para corrigir, abra a ficha da pessoa e
            lance as férias já gozadas no cartão de Férias.
          </AlertDescription>
        </Alert>
      )}

      {semAdmissao > 0 && (
        <Alert>
          <AlertDescription>
            <b>{semAdmissao} colaborador(es) ativos estão sem data de admissão</b> e por isso ficam de
            fora desta tela — sem ela não há como calcular período aquisitivo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Situação por colaborador</CardTitle>
          <CardDescription>
            O período mostrado é o mais próximo do limite entre os que ainda têm saldo. Clique no nome
            para abrir a ficha, programar férias ou lançar as que já foram gozadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome ou setor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setFiltro(f.chave)}
                  className={
                    filtro === f.chave
                      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Período aquisitivo</TableHead>
                  <TableHead>Gozar até</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum colaborador nesta situação.
                    </TableCell>
                  </TableRow>
                )}
                {visiveis.map((l) => (
                  <TableRow key={l.colaboradorId}>
                    <TableCell>
                      <Link
                        href={`/rh/${empresaId}/colaboradores/${l.colaboradorId}`}
                        className="font-medium hover:underline"
                      >
                        {l.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.setor}</TableCell>
                    <TableCell className="tabular-nums">
                      {l.periodo
                        ? `${formatarData(l.periodo.inicio)} — ${formatarData(l.periodo.fim)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {l.periodo ? formatarData(l.periodo.limiteConcessivo) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.saldoTotal}</TableCell>
                    <TableCell>
                      {l.semHistorico ? (
                        <Badge variant="outline">Sem histórico</Badge>
                      ) : !l.periodo ? (
                        <Badge variant="outline">Em dia</Badge>
                      ) : l.periodo.status === "VENCIDO" ? (
                        <Badge variant="destructive">
                          Vencida há {Math.abs(l.periodo.diasAteLimite)} d
                        </Badge>
                      ) : l.periodo.status === "VENCENDO" ? (
                        <Badge variant="secondary">Vence em {l.periodo.diasAteLimite} d</Badge>
                      ) : (
                        <Badge variant={VARIANTE[l.periodo.status]}>
                          {STATUS_PERIODO_LABEL[l.periodo.status]}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
