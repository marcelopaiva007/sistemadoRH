"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// A fila de regularização dos ASOs — pedido do RH em 31/08/2026: "começar
// pelos ASOs mais antigos e mais atrasados e ir regularizando gradativamente".
//
// Diferente dos outros cards da tela, este recebe a BASE INTEIRA de ativos
// (não só a janela de alerta): quem está regularizando precisa ver o vencido
// há 300 dias E quem nunca teve ASO cadastrado — que é justamente quem não
// aparecia em lugar nenhum, porque toda consulta partia da tabela de exames.

export type LinhaAso = {
  colaboradorId: string;
  empresaId: string;
  nome: string;
  empresaNome: string;
  setorNome: string;
  /** Rótulo do tipo do exame mais recente — null quando nunca houve ASO. */
  tipoLabel: string | null;
  validadeTexto: string | null;
  /**
   * Dias até o vencimento do ASO vigente: negativo = vencido há |dias| dias.
   * null = sem ASO cadastrado, ou ASO sem validade preenchida — os dois
   * precisam da mesma providência (regularizar o cadastro).
   */
  dias: number | null;
  temExame: boolean;
};

const VISOES = [
  { valor: "mais-atrasados", rotulo: "Mais atrasados primeiro" },
  { valor: "menos-atrasados", rotulo: "Menos atrasados primeiro" },
  { valor: "vencidos", rotulo: "Só vencidos" },
  { valor: "em-dia", rotulo: "Só em dia" },
  { valor: "sem-aso", rotulo: "Sem ASO cadastrado" },
] as const;

type Visao = (typeof VISOES)[number]["valor"];

export function AsoView({ linhas }: { linhas: LinhaAso[] }) {
  const [visao, setVisao] = useState<Visao>("mais-atrasados");

  const vencidos = linhas.filter((l) => l.dias !== null && l.dias < 0);
  const emDia = linhas.filter((l) => l.dias !== null && l.dias >= 0);
  const semAso = linhas.filter((l) => l.dias === null);

  // "Mais atrasados primeiro" é a fila de trabalho completa: vencidos do maior
  // atraso para o menor, depois os em dia (vencendo antes primeiro), e os sem
  // ASO por último — sem dia de atraso para ranquear, eles têm filtro próprio.
  const exibidas: LinhaAso[] =
    visao === "mais-atrasados"
      ? [
          ...[...vencidos].sort((a, b) => a.dias! - b.dias!),
          ...[...emDia].sort((a, b) => a.dias! - b.dias!),
          ...semAso,
        ]
      : visao === "menos-atrasados"
        ? [
            ...[...vencidos].sort((a, b) => b.dias! - a.dias!),
            ...[...emDia].sort((a, b) => a.dias! - b.dias!),
            ...semAso,
          ]
        : visao === "vencidos"
          ? [...vencidos].sort((a, b) => a.dias! - b.dias!)
          : visao === "em-dia"
            ? [...emDia].sort((a, b) => a.dias! - b.dias!)
            : semAso;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ASO / PCMSO</CardTitle>
        <CardDescription>
          Todos os colaboradores ativos, pelo exame mais recente de cada um (demissional não
          conta). {vencidos.length} vencido(s), {emDia.length} em dia, {semAso.length} sem ASO.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="visao-aso" className="text-xs text-muted-foreground">
            Mostrar
          </label>
          <select
            id="visao-aso"
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            value={visao}
            onChange={(e) => setVisao(e.target.value as Visao)}
          >
            {VISOES.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.rotulo}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{exibidas.length} colaborador(es)</span>
        </div>

        {exibidas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ninguém nesta situação. 🎉
          </p>
        ) : (
          <div className="rounded-md border">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibidas.map((l) => (
                  <TableRow key={l.colaboradorId}>
                    <TableCell>
                      <Link
                        href={`/rh/${l.empresaId}/colaboradores/${l.colaboradorId}`}
                        className="font-medium hover:underline"
                      >
                        {l.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.empresaNome}</TableCell>
                    <TableCell className="text-muted-foreground">{l.setorNome}</TableCell>
                    <TableCell>{l.tipoLabel ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{l.validadeTexto ?? "—"}</TableCell>
                    <TableCell>
                      {l.dias === null ? (
                        <Badge variant="destructive">
                          {l.temExame ? "ASO sem validade cadastrada" : "Sem ASO cadastrado"}
                        </Badge>
                      ) : l.dias < 0 ? (
                        <Badge variant="destructive">Vencido há {Math.abs(l.dias)} d</Badge>
                      ) : (
                        <Badge variant="secondary">Vence em {l.dias} d</Badge>
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
  );
}
