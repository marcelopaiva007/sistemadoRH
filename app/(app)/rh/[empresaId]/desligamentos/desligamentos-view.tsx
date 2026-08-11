"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IdCard, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MOTIVOS_DESLIGAMENTO, motivoDesligamentoLabel } from "@/lib/constants-dp";
import { corrigirDadosDesligamento } from "@/lib/actions/rh-offboarding";
import { formatarData } from "@/lib/datas";
import { Indicador } from "@/components/indicador";
import { CampoData, CampoSelect, FormularioAction } from "../colaboradores/[colaboradorId]/campos";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";

type Desligamento = {
  id: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  dataDesligamento: Date;
  motivoDesligamento: string | null;
  setorNome: string;
  checklistTotal: number;
  checklistConcluido: number;
  checklistDispensado: boolean;
  temEntrevista: boolean;
};

export function DesligamentosView({
  desligamentos,
  resumo,
}: {
  desligamentos: Desligamento[];
  resumo: { total: number; semChecklist: number; checklistPendente: number; semEntrevista: number };
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Desligamento | null>(null);
  const { itensDaPagina: desligamentosNaPagina, ...paginacao } = usePaginacao(desligamentos);

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
        <Indicador rotulo="Total desligado" valor={resumo.total} />
        <Indicador
          rotulo="Checklist não iniciado / pendente"
          valor={resumo.semChecklist + resumo.checklistPendente}
          estado={resumo.semChecklist + resumo.checklistPendente > 0 ? "alerta" : "padrao"}
        />
        <Indicador rotulo="Sem entrevista de desligamento" valor={resumo.semEntrevista} />
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
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Desligado em</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Entrevista</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {desligamentosNaPagina.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link
                          href={`/rh/${d.empresaId}/colaboradores/${d.id}?tab=desligamento`}
                          className="font-medium hover:underline"
                        >
                          {d.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.empresaNome}</TableCell>
                      <TableCell className="text-muted-foreground">{d.setorNome}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatarData(d.dataDesligamento)}
                      </TableCell>
                      <TableCell>
                        {d.motivoDesligamento ? motivoDesligamentoLabel(d.motivoDesligamento) : "—"}
                      </TableCell>
                      <TableCell>
                        {d.checklistDispensado ? (
                          <Badge variant="outline">Dispensado</Badge>
                        ) : d.checklistTotal === 0 ? (
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
                        ) : d.checklistDispensado ? (
                          // A dispensa de desligamento antigo cobre a entrevista
                          // também — mesma regra do contador em page.tsx.
                          <Badge variant="outline">Dispensada</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/rh/${d.empresaId}/colaboradores/${d.id}?tab=desligamento`}
                            className="inline-block rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Abrir ficha do colaborador"
                            aria-label={`Abrir ficha de ${d.nome}`}
                          >
                            <IdCard className="size-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditando(d)}
                            className="inline-block rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Corrigir data e motivo da saída"
                          >
                            <Pencil className="size-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={paginacao.total}
              porPagina={paginacao.porPagina}
              paginaAtual={paginacao.paginaAtual}
              totalPaginas={paginacao.totalPaginas}
              onMudarPagina={paginacao.irPara}
            />
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de correção: só data e motivo, direto da lista — completar os
          desligamentos importados sem abrir 105 fichas. `key` remonta o
          formulário a cada pessoa, senão o defaultValue da anterior vaza. */}
      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir desligamento{editando && ` — ${editando.nome}`}</DialogTitle>
          </DialogHeader>
          {editando && (
            <FormularioAction
              key={editando.id}
              // O CNPJ da LINHA, não o da rota: a lista soma vários CNPJs, e a
              // action valida acesso + escopa a busca por essa empresa.
              action={corrigirDadosDesligamento.bind(null, editando.empresaId, editando.id)}
              textoBotao="Salvar"
              mensagemSucesso="Desligamento corrigido."
              onSuccess={() => {
                setEditando(null);
                // A action revalida o caminho do CNPJ da linha; quando a rota
                // atual é de outro CNPJ, é este refresh que atualiza a tabela.
                router.refresh();
              }}
            >
              <CampoData
                name="dataDesligamento"
                label="Data de saída"
                defaultValue={editando.dataDesligamento}
              />
              <CampoSelect
                name="motivoDesligamento"
                label="Motivo da saída"
                opcoes={MOTIVOS_DESLIGAMENTO}
                defaultValue={editando.motivoDesligamento}
                required
              />
            </FormularioAction>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
