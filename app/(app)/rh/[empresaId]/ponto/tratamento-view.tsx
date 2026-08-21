"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileEdit, ShieldAlert, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registrarTratamentoPonto, decidirTratamentoPonto } from "@/app/actions/rh-ponto";
import { dataDoFormulario, formatarData } from "@/lib/datas";
// Rótulos consolidados em lib/constants-ponto.ts (21/08/2026): a mesma lista
// vale aqui, na Central de Aprovações e na validação do servidor.
import { tipoTratamentoLabel as tipoLabel, tipoMarcacaoLabel } from "@/lib/constants-ponto";

export type TratamentoItem = {
  id: string;
  dataFato: Date | string;
  tipo: string;
  motivo: string;
  /** Justificativa de quem decidiu — separada do `motivo`, que é de quem pediu. */
  motivoDecisao?: string | null;
  status: string;
  aprovadoPorNome?: string | null;
  /** "RH" (aberto nesta tela) ou "COLABORADOR" (pedido pelo portal/app). */
  origem?: string;
  /** Só nos pedidos de ajuste do colaborador: marcação e horário pedidos. */
  tipoMarcacao?: string | null;
  horaSolicitada?: string | null;
  colaborador: {
    nome: string;
    setor: { nome: string };
    posicao: { nome: string };
  };
};

export type OpcaoColaborador = { id: string; nome: string; ativo: boolean };

export function TratamentoView({
  empresaId,
  tratamentos,
  colaboradores,
}: {
  empresaId: string;
  tratamentos: TratamentoItem[];
  colaboradores: OpcaoColaborador[];
}) {
  const router = useRouter();
  const [modalAberta, setModalAberta] = useState(false);
  const [loading, setLoading] = useState(false);
  // Só o erro do FORMULÁRIO mora aqui; o da decisão vive dentro de cada
  // LinhaTratamento. Enquanto os dois dividiam um estado só no pai, o erro de
  // aprovar caía num elemento que só existe dentro do diálogo de criação —
  // invisível — e reaparecia depois num formulário em branco.
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [colaboradorId, setColaboradorId] = useState("");
  const [dataFato, setDataFato] = useState("");
  const [tipo, setTipo] = useState<"INCLUSAO_MANUAL" | "ABONO_ATESTADO" | "JUSTIFICATIVA" | "CORRECAO">("INCLUSAO_MANUAL");
  const [motivo, setMotivo] = useState("");

  const handleSalvarTratamento = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErroForm(null);

    // try/finally: sem ele, uma exceção na action (queda de conexão, pool
    // esgotado) deixaria o botão em "Registrando..." para sempre, sem erro na
    // tela e só resolvido com F5.
    try {
      const res = await registrarTratamentoPonto({
        empresaId,
        colaboradorId,
        // dataDoFormulario e não `new Date(str)`: a string "2026-08-11" do
        // <input type="date"> é interpretada como meia-noite UTC, e o dia da
        // ocorrência é justamente o dado com peso legal aqui. Ver lib/datas.ts.
        dataFato: dataDoFormulario(dataFato)!,
        tipo,
        motivo,
      });

      if (res.erro) {
        setErroForm(res.erro);
      } else {
        setModalAberta(false);
        setMotivo("");
        setColaboradorId("");
        setDataFato("");
        // Sem isto a lista abaixo continua mostrando o estado antigo: o
        // revalidatePath da action limpa o cache do servidor, mas este
        // componente é cliente e segue com as props que já tinha (mesma causa
        // do defeito da ficha corrigido em v1.63.6).
        router.refresh();
      }
    } catch {
      setErroForm("Não foi possível registrar agora. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Tratamento de Ponto (PTRP)</h2>
          <p className="text-xs text-muted-foreground">
            Ajustes e abonos legais conforme a Portaria MTP 671/2021. Registros de batidas originais são preservados.
          </p>
        </div>
        <Button
          size="sm"
          // Limpa o que sobrou da tentativa anterior: sem isto o diálogo
          // reabria com o erro antigo por cima de um formulário em branco.
          onClick={() => {
            setErroForm(null);
            setModalAberta(true);
          }}
          className="gap-1 text-xs"
        >
          <FileEdit className="w-4 h-4" /> Novo Ajuste / Abono
        </Button>
      </div>

      {modalAberta && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Registrar Tratamento de Ponto (PTRP)</CardTitle>
            {/* Este texto já mentiu duas vezes: dizia "assinado digitalmente
                pelo RH" quando o aprovador gravado era a string fixa "Gestor de
                RH", e depois prometeu que o ajuste "só vale depois de aprovado"
                — nada no sistema lê o status ainda. Descreve só o que de fato
                acontece. (Quem pediu passou a ser registrado de verdade, na
                trilha do AuditLog — ver registrarTratamentoPonto.) */}
            <CardDescription className="text-xs">
              O ajuste entra como pendente e precisa de decisão. Ficam registrados quem decidiu,
              quando e a justificativa — as batidas originais nunca são alteradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarTratamento} className="space-y-3">
              {erroForm && (
                <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">{erroForm}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs" required>
                    Colaborador
                  </Label>
                  {/* Era um campo de texto pedindo "cole o ID do funcionário".
                      Ninguém sabe o id de ninguém: ou se abria outra aba para
                      copiar, ou se digitava errado e o ajuste ia para o ponto
                      de outra pessoa. A lista já vem carregada na página. */}
                  <select
                    value={colaboradorId}
                    onChange={(e) => setColaboradorId(e.target.value)}
                    className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
                    required
                  >
                    <option value="">Selecione…</option>
                    {colaboradores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.ativo ? "" : " (desligado)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Data da Ocorrência / Fato</Label>
                  <Input
                    type="date"
                    value={dataFato}
                    onChange={(e) => setDataFato(e.target.value)}
                    className="h-8 text-xs mt-1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de Tratamento Legal</Label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof tipo)}
                    className="w-full h-8 text-xs mt-1 border rounded-md px-2 bg-background"
                  >
                    <option value="INCLUSAO_MANUAL">Inclusão Manual (Esquecimento)</option>
                    <option value="ABONO_ATESTADO">Abono por Atestado Médico</option>
                    <option value="JUSTIFICATIVA">Justificativa de Falta/Atraso</option>
                    <option value="CORRECAO">Correção de Batida Duplicada</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Motivo / Justificativa do RH (Auditado)</Label>
                <Textarea
                  placeholder="Escreva a justificativa clara do ajuste (ex: Atestado médico apresentado de 1 dia)..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="text-xs mt-1 min-h-[60px]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setModalAberta(false);
                    setErroForm(null);
                  }}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={loading} className="text-xs">
                  {loading ? "Registrando..." : "Confirmar Ajuste PTRP"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Tratamentos de Ponto (PTRP) */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            Histórico Auditado de Tratamentos (PTRP - MTP 671)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {tratamentos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum tratamento ou ajuste realizado no período.</p>
            ) : (
              tratamentos.map((t) => (
                <LinhaTratamento key={t.id} empresaId={empresaId} tratamento={t} />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Uma linha do histórico, com o estado da decisão DENTRO dela.
 *
 * A primeira versão guardava `decidindo`, `rejeitando`, `motivoRejeicao` e
 * `erroDecisao` no componente pai, um de cada para N linhas. O resultado:
 * o erro de uma decisão aparecia em todas as OUTRAS linhas e não na que foi
 * clicada, e decidir duas linhas em sequência reabilitava a primeira com a
 * segunda ainda em voo. Estado por linha elimina os dois — é a mesma forma do
 * ItemAprovacao da Central de Aprovações.
 */
function LinhaTratamento({
  empresaId,
  tratamento: t,
}: {
  empresaId: string;
  tratamento: TratamentoItem;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const decidir = async (decisao: "APROVADO" | "REJEITADO") => {
    setEnviando(true);
    setErro(null);
    try {
      const res = await decidirTratamentoPonto({
        empresaId,
        tratamentoId: t.id,
        decisao,
        motivoDecisao: decisao === "REJEITADO" ? motivoRejeicao : undefined,
      });
      if (!res.ok) {
        setErro(res.error);
        // Atualiza mesmo em erro: o caso comum é "alguém decidiu antes de
        // você", e a linha precisa parar de se anunciar como pendente.
        router.refresh();
      } else {
        setPedindoMotivo(false);
        setMotivoRejeicao("");
        router.refresh();
      }
    } catch {
      setErro("Não foi possível registrar a decisão agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 transition-colors hover:bg-muted/30">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t.colaborador.nome}</span>
          <Badge variant="outline" className="text-[10px]">
            {tipoLabel(t.tipo)}
          </Badge>
          {/* Pedido que chegou do portal/app não é ajuste que o RH abriu — a
              etiqueta separa "fila de pedidos recebidos" de "trabalho próprio",
              que têm conversas diferentes com o colaborador. */}
          {t.origem === "COLABORADOR" && (
            <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30 text-[10px]">
              Pedido do colaborador
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {/* formatarData (UTC) e não toLocaleDateString: a data é gravada como
              meia-noite UTC, e no fuso do Brasil o formatador local exibiria o
              DIA ANTERIOR — no campo que diz quando a ocorrência aconteceu. */}
          {t.colaborador.setor.nome} · Data: {formatarData(new Date(t.dataFato))}
          {t.tipoMarcacao && t.horaSolicitada
            ? ` · ${tipoMarcacaoLabel(t.tipoMarcacao)} às ${t.horaSolicitada}`
            : ""}
        </p>
        {/* whitespace-pre-line: rejeições antigas, anteriores à coluna
            `motivoDecisao`, ainda trazem a decisão colada aqui com quebra de
            linha. Sem isto elas viram um parágrafo só. */}
        <p className="text-xs whitespace-pre-line text-foreground italic">
          &ldquo;{t.motivo}&rdquo;
        </p>
        {/* Os dois textos aparecem separados porque são de pessoas diferentes:
            o de cima é o pedido, este é a decisão. Colados num campo só — como
            eram até 11/08/2026 — não dá para saber quem escreveu o quê. */}
        {t.motivoDecisao && (
          <p className="border-l-2 border-muted pl-2 text-xs whitespace-pre-line text-muted-foreground">
            <span className="font-medium">
              {t.status === "REJEITADO" ? "Motivo da rejeição" : "Observação da decisão"}
              {t.aprovadoPorNome ? ` (${t.aprovadoPorNome})` : ""}:
            </span>{" "}
            {t.motivoDecisao}
          </p>
        )}
      </div>

      {/* Antes esta coluna escrevia "Aprovado · Por: RH" em TODA linha,
          ignorando t.status. Num histórico que existe para auditoria, afirmar
          aprovação sobre o que não foi aprovado é o pior defeito possível. */}
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        {t.status === "APROVADO" && (
          <>
            <span className="flex items-center justify-end gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
            </span>
            <span className="mt-0.5 block text-[10px]">Por: {t.aprovadoPorNome ?? "—"}</span>
          </>
        )}
        {t.status === "REJEITADO" && (
          <>
            <span className="flex items-center justify-end gap-1 font-semibold text-destructive">
              <XCircle className="h-3.5 w-3.5" /> Rejeitado
            </span>
            <span className="mt-0.5 block text-[10px]">Por: {t.aprovadoPorNome ?? "—"}</span>
          </>
        )}
        {t.status === "PENDENTE" && (
          <div className="flex w-56 flex-col items-end gap-1.5">
            <span className="flex items-center gap-1 font-semibold text-warning">
              <Clock3 className="h-3.5 w-3.5" /> Aguardando decisão
            </span>

            {/* Campo inline em vez de window.prompt: o prompt some de vez se a
                pessoa marcar "impedir novos diálogos" no navegador, e aí o
                botão Rejeitar fica calado para sempre. */}
            {pedindoMotivo ? (
              <>
                <Textarea
                  autoFocus
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Por que está sendo rejeitado?"
                  className="min-h-[52px] w-full text-xs"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setPedindoMotivo(false);
                      setMotivoRejeicao("");
                      setErro(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 text-[11px]"
                    disabled={enviando || motivoRejeicao.trim().length < 5}
                    onClick={() => decidir("REJEITADO")}
                  >
                    {enviando ? "..." : "Confirmar rejeição"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={enviando}
                  onClick={() => {
                    setPedindoMotivo(true);
                    setErro(null);
                  }}
                >
                  Rejeitar
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={enviando}
                  onClick={() => decidir("APROVADO")}
                >
                  {enviando ? "..." : "Aprovar"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* O erro mora na PRÓPRIA linha decidida. */}
        {erro && <p className="mt-1 text-right text-[11px] text-destructive">{erro}</p>}
      </div>
    </div>
  );
}
