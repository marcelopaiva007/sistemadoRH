"use client";

import Link from "next/link";
import { AlertOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { situacaoAcidenteLabel, tipoAcidenteLabel } from "@/lib/constants-cat";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { Indicador } from "@/components/indicador";

type Acidente = {
  id: string;
  empresaId: string;
  dataHora: Date;
  tipo: string;
  descricao: string;
  houveAfastamento: boolean;
  catEmitida: boolean;
  catNumero: string | null;
  situacao: string;
  colaboradorId: string;
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

export function AcidentesView({
  acidentes,
  resumo,
}: {
  acidentes: Acidente[];
  resumo: { total: number; catsPendentes: number; emInvestigacao: number };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1>Acidentes de trabalho / CAT</h1>
        <p className="text-sm text-muted-foreground">
          Todos os registros da empresa. A Comunicação de Acidente de Trabalho (CAT) tem prazo legal
          de 1 dia útil ao INSS — imediato se o acidente for fatal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Total registrado" valor={resumo.total} />
        <Indicador rotulo="CAT pendente de emissão" valor={resumo.catsPendentes} estado={resumo.catsPendentes > 0 ? "alerta" : "padrao"} />
        <Indicador rotulo="Em investigação" valor={resumo.emInvestigacao} />
      </div>

      {resumo.catsPendentes > 0 && (
        <Alert variant="destructive">
          <AlertOctagon className="size-4" />
          <AlertDescription>
            Há {resumo.catsPendentes} acidente(s) sem CAT emitida. A emissão é feita no site do
            governo (eSocial/INSS) — este sistema só ajuda a não perder o prazo e guarda a prova de
            quando foi feita.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>CAT pendente aparece primeiro.</CardDescription>
        </CardHeader>
        <CardContent>
          {acidentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum acidente registrado nesta empresa.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CAT</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acidentes.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatarDataHoraBrasilia(a.dataHora)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/rh/${a.empresaId}/colaboradores/${a.colaboradorId}`}
                          className="font-medium hover:underline"
                        >
                          {a.colaborador.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.colaborador.empresa.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{a.colaborador.setor.nome}</TableCell>
                      <TableCell>
                        {tipoAcidenteLabel(a.tipo)}
                        {a.houveAfastamento && <span className="ml-1.5 text-xs text-muted-foreground">(afastado)</span>}
                      </TableCell>
                      <TableCell>
                        {a.catEmitida ? (
                          <Badge variant="default">nº {a.catNumero}</Badge>
                        ) : (
                          <Badge variant="destructive">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.situacao === "CONCLUIDO" ? "secondary" : "outline"}>
                          {situacaoAcidenteLabel(a.situacao)}
                        </Badge>
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

