"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { causaDesligamentoLabel, motivoDesligamentoLabel } from "@/lib/constants-dp";
import type { ContratacaoErrada, LinhaContratacao } from "@/lib/desligamentos/analises";
import type { FiltrosDaArea } from "@/lib/desligamentos/area";
import { cn } from "@/lib/utils";
import { BotaoExportarPdf, FiltrosDaAreaBarra } from "../filtros-da-area";

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function ContratacaoView({
  empresaId,
  dados,
  filtros,
  nomeDoRecorte,
  avisos,
}: {
  empresaId: string;
  dados: ContratacaoErrada;
  filtros: FiltrosDaArea;
  nomeDoRecorte: string | null;
  avisos: string[];
}) {
  const t = dados.total;
  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Contratação errada"
        resumo={
          <>
            Em {filtros.periodo.rotulo}
            {nomeDoRecorte ? `, no ${nomeDoRecorte}` : ""}: {t.ate90} saída(s) com menos de 90 dias de casa e {t.ate180} com
            menos de 180, de {t.saidas}. Das {t.admissoes} contratações do período,{" "}
            <b className="text-foreground">{t.admissoesQueSairam} já saíram</b> ({pct(t.pctAdmissoesQueSairam)}).
          </>
        }
        acoes={<BotaoExportarPdf empresaId={empresaId} />}
      />

      <FiltrosDaAreaBarra filtros={filtros} />

      <FaixaDeIndicadores colunas={4}>
        <Indicador
          rotulo="Saíram com menos de 90 dias"
          valor={t.ate90}
          complemento={`${pct(t.pctAte90)} das saídas com data de admissão`}
          estado={t.ate90 > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Saíram com menos de 180 dias"
          valor={t.ate180}
          complemento={`${pct(t.pctAte180)} — inclui as de menos de 90`}
          estado={t.ate180 > 0 ? "atencao" : "padrao"}
        />
        <Indicador
          rotulo="Contratações que já saíram"
          valor={`${t.admissoesQueSairam} de ${t.admissoes}`}
          complemento={`${pct(t.pctAdmissoesQueSairam)} das admissões do período`}
        />
        <Indicador
          rotulo="Saídas sem admissão na ficha"
          valor={t.semAdmissao}
          complemento="não dá para medir o tempo de casa delas"
        />
      </FaixaDeIndicadores>

      <TabelaContratacao titulo="Por setor" rotulo="Setor" linhas={dados.porSetor} />
      <TabelaContratacao titulo="Por gestor" rotulo="Gestor" linhas={dados.porGestor} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quem saiu com menos de 180 dias</CardTitle>
          <CardDescription>Do mais rápido para o mais lento. Tempo de casa contado da entrada no grupo.</CardDescription>
        </CardHeader>
        <CardContent>
          {dados.pessoas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Ninguém saiu com menos de 180 dias no período.</p>
          ) : (
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead className="text-right">Dias de casa</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Gestor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Causa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.pessoas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/rh/${p.empresaId}/colaboradores/${p.id}`} className="font-medium hover:underline">
                        {p.nome}
                      </Link>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", (p.diasDeCasa ?? 999) < 90 && "font-bold")}>
                      {p.diasDeCasa}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{p.data}</TableCell>
                    <TableCell className="text-muted-foreground">{p.setor}</TableCell>
                    <TableCell className="text-muted-foreground">{p.gestor}</TableCell>
                    <TableCell>{p.motivo ? motivoDesligamentoLabel(p.motivo) : "—"}</TableCell>
                    <TableCell>{p.causa ? causaDesligamentoLabel(p.causa) : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {avisos.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {avisos.map((a) => (
            <p key={a}>• {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function TabelaContratacao({ titulo, rotulo, linhas }: { titulo: string; rotulo: string; linhas: LinhaContratacao[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>Mais saídas precoces primeiro.</CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nada a mostrar neste recorte.</p>
        ) : (
          <Table compacta>
            <TableHeader>
              <TableRow>
                <TableHead>{rotulo}</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Menos de 90 dias</TableHead>
                <TableHead className="text-right">Menos de 180 dias</TableHead>
                <TableHead className="text-right">Contratações</TableHead>
                <TableHead className="text-right">Já saíram</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.chave}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.saidas}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.ate90} <span className="text-muted-foreground">({pct(l.pctAte90)})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.ate180} <span className="text-muted-foreground">({pct(l.pctAte180)})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.admissoes}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.admissoesQueSairam} <span className="text-muted-foreground">({pct(l.pctAdmissoesQueSairam)})</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
