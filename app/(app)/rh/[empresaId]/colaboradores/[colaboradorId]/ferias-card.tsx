"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  solicitarFerias,
  decidirFerias,
  excluirSolicitacaoFerias,
  registrarFeriasGozadas,
  conciliarSaldoFerias,
} from "@/lib/actions/rh-ferias";
import { STATUS_PERIODO_BADGE, DIAS_FERIAS_POR_PERIODO, type ResumoFerias } from "@/lib/ferias";
import { STATUS_SOLICITACAO_BADGE } from "@/lib/constants-dp";
import { formatarData, paraInputDate } from "@/lib/datas";
import { Campo, CampoData, CampoTexto, CampoCheckbox, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Solicitacao = {
  id: string;
  periodoAquisitivoInicio: Date;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  diasAbono: number;
  decimoAntecipado: boolean;
  observacoes: string | null;
  status: string;
  solicitadoPorNome: string | null;
  decididoPorNome: string | null;
  motivoDecisao: string | null;
};

export function FeriasCard({
  empresaId,
  colaboradorId,
  solicitacoes,
  resumo,
}: {
  empresaId: string;
  colaboradorId: string;
  solicitacoes: Solicitacao[];
  resumo: ResumoFerias | null;
}) {
  const [novoAberto, setNovoAberto] = useState(false);
  const [gozadaAberto, setGozadaAberto] = useState(false);
  const [conciliarAberto, setConciliarAberto] = useState(false);

  if (!resumo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Férias</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Preencha a <strong>data de admissão</strong> na aba Ficha para o sistema calcular os
              períodos aquisitivos e liberar a programação de férias.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const periodosSelecionaveis = resumo.periodos.filter((p) => p.status !== "EM_CURSO" && p.saldo > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Períodos aquisitivos</CardTitle>
          <CardDescription>
            Calculados a partir da data de admissão. As férias precisam ser gozadas dentro dos 12
            meses seguintes ao fim do período — depois disso o pagamento é em dobro (CLT art. 137).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resumo.temVencido && (
            <Alert variant="destructive">
              <AlertDescription>
                Há período com férias <strong>vencidas</strong>. Programe o gozo o quanto antes.
              </AlertDescription>
            </Alert>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período aquisitivo</TableHead>
                  <TableHead>Gozar até</TableHead>
                  <TableHead className="text-right">Usados</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.periodos.map((p) => (
                  <TableRow key={p.inicio.toISOString()}>
                    <TableCell className="tabular-nums">
                      {formatarData(p.inicio)} — {formatarData(p.fim)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.status === "EM_CURSO" && p.progresso ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-[width]"
                              style={{ width: `${p.progresso.percentual}%` }}
                            />
                          </div>
                          <span className="text-xs whitespace-nowrap text-muted-foreground">
                            {p.progresso.meses}/12 meses ({p.progresso.diasCorridos} d)
                          </span>
                        </div>
                      ) : (
                        formatarData(p.limiteConcessivo)
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.diasUsados}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.diasReservados}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{p.saldo}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} map={STATUS_PERIODO_BADGE}>
                        {p.status === "VENCENDO" && ` · ${p.diasAteLimite} d`}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.status === "VENCIDO" && p.saldo > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            // Pré-seleciona o período e abre o modal
                            setGozadaAberto(true);
                          }}
                          className="inline-block rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Marcar como gozada"
                        >
                          <History className="size-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Saldo total disponível: <strong className="text-foreground tabular-nums">{resumo.saldoDisponivel}</strong> dias.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programação</CardTitle>
          <CardDescription>Pedidos de férias e o histórico de decisões.</CardDescription>
          <CardAction className="flex gap-2">
            {/* Só para quem ainda não tem NENHUM lançamento — é o estado de
                quem veio da importação sem histórico de gozo. Uma vez usado
                (ou uma vez lançada a 1ª férias por qualquer outro caminho),
                este botão some e "Lançar férias já gozadas" assume, período a
                período — misturar os dois no mesmo colaborador contaria dia
                duas vezes. */}
            {solicitacoes.length === 0 && periodosSelecionaveis.length > 0 && (
              <Dialog open={conciliarAberto} onOpenChange={setConciliarAberto}>
                <DialogTrigger render={<Button size="sm" variant="outline" />}>
                  <History className="size-4" />
                  Conciliar saldo atual
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Conciliar saldo atual de férias</DialogTitle>
                  </DialogHeader>
                  <Alert className="mb-4">
                    <AlertDescription>
                      Para quem veio da importação sem data exata de cada férias gozada: informe
                      quantos <strong>dias</strong> de saldo a pessoa tem HOJE, e o sistema calcula
                      de trás para frente — marca os períodos aquisitivos mais{" "}
                      <strong>antigos</strong> como já gozados até bater esse saldo. A data de gozo
                      fica estimada; o que importa é o saldo resultante bater com a realidade.
                      <br />
                      <br />
                      Acumulado desde a admissão:{" "}
                      <strong>
                        {periodosSelecionaveis.length * DIAS_FERIAS_POR_PERIODO} dias
                      </strong>{" "}
                      em {periodosSelecionaveis.length} período(s) completo(s). Pensando em meses:
                      multiplique por 30 (ex.: 2 meses ≈ 60 dias).
                    </AlertDescription>
                  </Alert>
                  <FormularioAction
                    action={conciliarSaldoFerias.bind(null, empresaId, colaboradorId)}
                    textoBotao="Conciliar"
                    mensagemSucesso="Saldo de férias conciliado."
                    onSuccess={() => setConciliarAberto(false)}
                  >
                    <CampoTexto
                      name="diasAtuais"
                      label="Saldo atual (dias)"
                      type="number"
                      min={0}
                      max={periodosSelecionaveis.length * DIAS_FERIAS_POR_PERIODO}
                      required
                    />
                    <Campo label="Observações">
                      <Textarea
                        name="observacoes"
                        rows={2}
                        placeholder="Ex.: conferido com o RH anterior / planilha do sistema antigo"
                      />
                    </Campo>
                  </FormularioAction>
                </DialogContent>
              </Dialog>
            )}

            {/* Lançamento retroativo: a base foi importada sem histórico de gozo,
                então o RH precisa poder registrar o que já aconteceu. Sem isso o
                saldo fica inflado e todo mundo com 2+ anos aparece como vencido. */}
            <Dialog open={gozadaAberto} onOpenChange={setGozadaAberto}>
              <DialogTrigger
                render={<Button size="sm" variant="outline" disabled={periodosSelecionaveis.length === 0} />}
              >
                <History className="size-4" />
                Lançar férias já gozadas
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Lançar férias já gozadas</DialogTitle>
                </DialogHeader>
                <Alert className="mb-4">
                  <AlertDescription>
                    Use para registrar férias que <strong>já aconteceram</strong> e não estão no
                    sistema. Entra direto como aprovada, sem passar por aprovação, e fica registrado
                    na auditoria em seu nome.
                  </AlertDescription>
                </Alert>
                <FormularioAction
                  action={registrarFeriasGozadas.bind(null, empresaId, colaboradorId)}
                  textoBotao="Registrar"
                  mensagemSucesso="Férias registradas no histórico."
                  onSuccess={() => setGozadaAberto(false)}
                >
                  <Campo label="Período aquisitivo">
                    <select
                      name="periodoAquisitivoInicio"
                      required
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      {periodosSelecionaveis.map((p) => (
                        <option key={p.inicio.toISOString()} value={paraInputDate(p.inicio)}>
                          {formatarData(p.inicio)} a {formatarData(p.fim)} — {p.saldo} dia(s) de saldo
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData name="dataInicio" label="Início do gozo" />
                    <CampoData name="dataFim" label="Fim do gozo" />
                  </div>
                  <CampoTexto
                    name="diasAbono"
                    label="Dias vendidos na época (abono), se houve"
                    type="number"
                    min={0}
                    max={10}
                    defaultValue="0"
                  />
                  <Campo label="Observações">
                    <Textarea name="observacoes" rows={2} placeholder="Ex.: conferido na ficha física" />
                  </Campo>
                </FormularioAction>
              </DialogContent>
            </Dialog>

            <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
              <DialogTrigger render={<Button size="sm" disabled={periodosSelecionaveis.length === 0} />}>
                <Plus className="size-4" />
                Programar férias
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Programar férias</DialogTitle>
                </DialogHeader>
                <FormularioAction
                  action={solicitarFerias.bind(null, empresaId, colaboradorId)}
                  textoBotao="Solicitar"
                  mensagemSucesso="Férias solicitadas — aguardando aprovação."
                  onSuccess={() => setNovoAberto(false)}
                >
                  <Campo label="Período aquisitivo">
                    <select
                      name="periodoAquisitivoInicio"
                      required
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      {periodosSelecionaveis.map((p) => (
                        <option key={p.inicio.toISOString()} value={paraInputDate(p.inicio)}>
                          {formatarData(p.inicio)} a {formatarData(p.fim)} — {p.saldo} dia(s) de saldo
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoData name="dataInicio" label="Início do gozo" />
                    <CampoData name="dataFim" label="Fim do gozo" />
                  </div>
                  <CampoTexto
                    name="diasAbono"
                    label="Abono pecuniário (dias vendidos, até 10)"
                    type="number"
                    min={0}
                    max={10}
                    defaultValue="0"
                  />
                  <CampoCheckbox name="decimoAntecipado" label="Adiantar a 1ª parcela do 13º" />
                  <Campo label="Observações">
                    <Textarea name="observacoes" rows={2} />
                  </Campo>
                </FormularioAction>
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {solicitacoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma férias programada.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gozo</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="text-right">Abono</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Decisão</TableHead>
                    <TableHead className="w-40 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solicitacoes.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums">
                        {formatarData(s.dataInicio)} — {formatarData(s.dataFim)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.dias}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.diasAbono || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} map={STATUS_SOLICITACAO_BADGE} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.decididoPorNome ?? "—"}
                        {s.motivoDecisao && <span className="block text-xs">{s.motivoDecisao}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status === "PENDENTE" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const r = await decidirFerias(empresaId, s.id, "APROVADA");
                                  if (r.ok) toast.success("Férias aprovadas.");
                                  else toast.error(r.error);
                                }}
                              >
                                <Check className="size-4" />
                                Aprovar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const r = await decidirFerias(empresaId, s.id, "REPROVADA");
                                  if (r.ok) toast.success("Férias reprovadas.");
                                  else toast.error(r.error);
                                }}
                              >
                                <X className="size-4" />
                              </Button>
                            </>
                          )}
                          {s.status === "APROVADA" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const r = await decidirFerias(empresaId, s.id, "CANCELADA");
                                if (r.ok) toast.success("Férias canceladas.");
                                else toast.error(r.error);
                              }}
                            >
                              Cancelar
                            </Button>
                          )}
                          {s.status !== "APROVADA" && (
                            <BotaoExcluir
                              onConfirm={async () => {
                                const r = await excluirSolicitacaoFerias(empresaId, s.id);
                                if (r.ok) toast.success("Solicitação excluída.");
                                else toast.error(r.error);
                              }}
                            />
                          )}
                        </div>
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
