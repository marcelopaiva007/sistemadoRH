"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARGOS } from "@/lib/constants";
import type { AcompanhamentoFuncionario } from "@/lib/acompanhamento";

const cargoLabel = (cargo: string) => CARGOS.find((c) => c.value === cargo)?.label ?? cargo;

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MetasView({
  acompanhamentos,
  periodo,
}: {
  acompanhamentos: AcompanhamentoFuncionario[];
  periodo: string;
}) {
  const router = useRouter();

  const comMetaAberta = acompanhamentos.filter((a) =>
    a.metas.some((m) => (m.faltam ?? 0) > 0),
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Mês de referência</Label>
              <Input
                type="month"
                defaultValue={periodo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{4}-\d{2}$/.test(v)) router.push(`/metas?periodo=${v}`);
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {acompanhamentos.length} pessoa(s) — {comMetaAberta} com meta em aberto.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="text-right">Internet</TableHead>
              <TableHead className="text-right">Falta p/ próxima faixa</TableHead>
              <TableHead className="text-right">Bonificação atual</TableHead>
              <TableHead>Feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {acompanhamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum funcionário ativo para acompanhar neste período.
                </TableCell>
              </TableRow>
            )}
            {acompanhamentos.map((a) => {
              const internet = a.metas.find((m) => m.servico === "internet");
              const faltaInternet = internet?.faltam ?? null;
              return (
                <TableRow key={a.funcionarioId}>
                  <TableCell className="font-medium">{a.nome}</TableCell>
                  <TableCell>{cargoLabel(a.cargo)}</TableCell>
                  <TableCell className="text-right">
                    {internet ? internet.qtdAtual : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {faltaInternet != null && faltaInternet > 0 ? (
                      <Badge variant="secondary">
                        {faltaInternet} → {reais(internet?.valorPorVendaProxima ?? 0)}/venda
                      </Badge>
                    ) : internet ? (
                      <Badge>no topo</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {reais(a.bonificacaoAtual)}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">
                    {a.mensagem}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
