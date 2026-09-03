"use client";

import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { conferirPlanilha, confirmarImportacao } from "@/lib/actions/rh-importacao";
import type { RelatorioConferencia, ResultadoImportacao } from "@/lib/actions/rh-importacao";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { Indicador } from "@/components/indicador";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";

type ItemHistorico = {
  id: string;
  arquivoNome: string;
  totalLinhas: number;
  criados: number;
  atualizados: number;
  criadoPorNome: string | null;
  createdAt: Date;
};

export function ImportacoesView({
  empresaId,
  empresaNome,
  empresaTemCnpj,
  historico,
}: {
  empresaId: string;
  empresaNome: string;
  empresaTemCnpj: boolean;
  historico: ItemHistorico[];
}) {
  // O relatório da conferência fica em estado local; o "confirmar" manda o
  // lote de volta por um campo escondido. O arquivo em si só viaja uma vez —
  // depois da conferência, o input de arquivo já pode até ser limpo.
  const [relatorio, setRelatorio] = useState<RelatorioConferencia | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [, conferirAction, conferindo] = useActionState(
    async (_prev: ResultadoImportacao | null, fd: FormData) => {
      const r = await conferirPlanilha(empresaId, _prev, fd);
      if (!r.ok) {
        toast.error(r.error);
        return r;
      }
      if (r.fase === "conferencia") setRelatorio(r);
      return r;
    },
    null,
  );

  const [, confirmarAction, importando] = useActionState(
    async (_prev: ResultadoImportacao | null, fd: FormData) => {
      const r = await confirmarImportacao(empresaId, _prev, fd);
      if (!r.ok) {
        toast.error(r.error);
        return r;
      }
      if (r.fase === "importado") {
        toast.success(
          `Importado: ${r.criados} criado(s), ${r.atualizados} atualizado(s).`,
        );
        setRelatorio(null);
        formRef.current?.reset();
      }
      return r;
    },
    null,
  );

  const totalOk = relatorio ? relatorio.criar.length + relatorio.atualizar.length : 0;
  // Array estável mesmo com relatório nulo: hook não pode ser chamado dentro
  // do `{relatorio && (...)}` — regra dos hooks exige topo incondicional.
  const { itensDaPagina: problemasNaPagina, ...paginacaoProblemas } = usePaginacao(
    relatorio?.problemas ?? [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1>Importações</h1>
        <p className="medida-de-leitura text-sm text-muted-foreground">
          Suba a planilha de colaboradores de {empresaNome} em CSV. Nada é gravado antes de você
          conferir o resumo — linha com problema fica de fora e é listada com o motivo.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4 text-muted-foreground" />
              1 · Baixe o modelo
            </CardTitle>
            <CardDescription>
              Abra no Excel, preencha (uma pessoa por linha) e salve como CSV. As colunas
              obrigatórias são nome, setor e cargo — as demais preenchem a ficha se vierem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              render={<a href={`/api/rh/${empresaId}/importacoes/modelo`} download />}
            >
              <FileSpreadsheet className="size-4" />
              Baixar modelo-colaboradores.csv
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4 text-muted-foreground" />
              2 · Envie para conferência
            </CardTitle>
            <CardDescription>
              O arquivo é validado linha a linha: CPF pelos dígitos, datas, valores e tipo de
              contrato. Você vê o que vai acontecer antes de qualquer gravação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} action={conferirAction} className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="arquivo"
                accept=".csv,text/csv"
                required
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
              />
              <Button type="submit" disabled={conferindo}>
                {conferindo ? "Conferindo..." : "Conferir planilha"}
              </Button>
            </form>
            {!empresaTemCnpj && (
              <p className="mt-3 text-xs text-muted-foreground">
                Esta empresa ainda está sem o número do CNPJ (Configuração → Marcas &amp; CNPJs).
                Dá para importar mesmo assim; só não use a coluna opcional de CNPJ na planilha.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {relatorio && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              Conferência de {relatorio.arquivoNome}
            </CardTitle>
            <CardDescription>
              Nada foi gravado ainda. Revise e confirme — só as linhas sem problema entram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Indicador rotulo="Serão criados" valor={relatorio.criar.length} />
              <Indicador rotulo="Serão atualizados" valor={relatorio.atualizar.length} />
              <Indicador
                rotulo="Com problema (ficam de fora)"
                valor={relatorio.problemas.length}
                estado={relatorio.problemas.length > 0 ? "alerta" : "padrao"}
              />
            </div>

            {(relatorio.setoresNovos.length > 0 || relatorio.cargosNovos.length > 0) && (
              <Alert>
                <TriangleAlert className="size-4" />
                <AlertDescription>
                  {relatorio.setoresNovos.length > 0 && (
                    <span>
                      Setores novos que serão criados:{" "}
                      <span className="font-medium text-foreground">
                        {relatorio.setoresNovos.join(", ")}
                      </span>
                      .{" "}
                    </span>
                  )}
                  {relatorio.cargosNovos.length > 0 && (
                    <span>
                      Cargos novos:{" "}
                      <span className="font-medium text-foreground">
                        {relatorio.cargosNovos.join(", ")}
                      </span>
                      .
                    </span>
                  )}{" "}
                  Se algum for erro de digitação na planilha, corrija lá antes de confirmar —
                  senão vira cadastro duplicado.
                </AlertDescription>
              </Alert>
            )}

            {relatorio.colunasIgnoradas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Colunas ignoradas (não reconhecidas): {relatorio.colunasIgnoradas.join(", ")}.
              </p>
            )}

            {relatorio.problemas.length > 0 && (
              <div className="rounded-md border">
                <Table compacta>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Linha</TableHead>
                      <TableHead>Quem</TableHead>
                      <TableHead>O que impede</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {problemasNaPagina.map((p) => (
                      <TableRow key={p.numeroDaLinha}>
                        <TableCell className="tabular-nums">{p.numeroDaLinha}</TableCell>
                        <TableCell>{p.nome}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.mensagens.join("; ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="border-t p-2">
                  <Paginacao
                    total={paginacaoProblemas.total}
                    porPagina={paginacaoProblemas.porPagina}
                    paginaAtual={paginacaoProblemas.paginaAtual}
                    totalPaginas={paginacaoProblemas.totalPaginas}
                    onMudarPagina={paginacaoProblemas.irPara}
                  />
                </div>
              </div>
            )}

            <form action={confirmarAction} className="flex items-center gap-3">
              <input type="hidden" name="lote" value={relatorio.lote} />
              <input type="hidden" name="arquivoNome" value={relatorio.arquivoNome} />
              <Button type="submit" disabled={importando || totalOk === 0}>
                {importando
                  ? "Importando..."
                  : totalOk === 0
                    ? "Nenhuma linha válida"
                    : `Confirmar importação de ${totalOk} linha(s)`}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRelatorio(null)}>
                Cancelar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
          <CardDescription>As últimas 20 importações desta empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma planilha importada ainda.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Quem</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.arquivoNome}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatarDataHoraBrasilia(h.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {h.criadoPorNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{h.totalLinhas}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3 text-success" />
                          {h.criados} criado(s) · {h.atualizados} atualizado(s)
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

