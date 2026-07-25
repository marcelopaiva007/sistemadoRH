"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motivoDesligamentoLabel } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";

type Desligamento = {
  id: string;
  nome: string;
  dataDesligamento: Date;
  motivoDesligamento: string | null;
  setorNome: string;
  checklistTotal: number;
  checklistConcluido: number;
  temEntrevista: boolean;
};

export function DesligamentosView({
  empresaId,
  desligamentos,
  resumo,
}: {
  empresaId: string;
  desligamentos: Desligamento[];
  resumo: { total: number; semChecklist: number; checklistPendente: number; semEntrevista: number };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Desligamentos</h2>
        <p className="text-sm text-muted-foreground">
          Checklist de saída e entrevista de desligamento de todas as pessoas desligadas nesta
          empresa. Abra a ficha do colaborador para gerar o checklist ou registrar a entrevista.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador label="Total desligado" valor={resumo.total} />
        <Indicador
          label="Checklist não iniciado / pendente"
          valor={resumo.semChecklist + resumo.checklistPendente}
          alerta={resumo.semChecklist + resumo.checklistPendente > 0}
        />
        <Indicador label="Sem entrevista de desligamento" valor={resumo.semEntrevista} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Mais recentes primeiro.</CardDescription>
        </CardHeader>
        <CardContent>
          {desligamentos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum desligamento registrado nesta empresa.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Desligado em</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Entrevista</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {desligamentos.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link
                          href={`/rh/${empresaId}/colaboradores/${d.id}`}
                          className="font-medium hover:underline"
                        >
                          {d.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.setorNome}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatarData(d.dataDesligamento)}
                      </TableCell>
                      <TableCell>
                        {d.motivoDesligamento ? motivoDesligamentoLabel(d.motivoDesligamento) : "—"}
                      </TableCell>
                      <TableCell>
                        {d.checklistTotal === 0 ? (
                          <Badge variant="destructive">Não gerado</Badge>
                        ) : d.checklistConcluido === d.checklistTotal ? (
                          <Badge variant="default">
                            {d.checklistConcluido}/{d.checklistTotal}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {d.checklistConcluido}/{d.checklistTotal}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {d.temEntrevista ? (
                          <Badge variant="default">Registrada</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor}</div>
    </div>
  );
}
