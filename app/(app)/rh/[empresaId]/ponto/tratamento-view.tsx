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

export type TratamentoItem = {
  id: string;
  dataFato: Date | string;
  tipo: string;
  motivo: string;
  status: string;
  aprovadoPorNome?: string | null;
  colaborador: {
    nome: string;
    setor: { nome: string };
    posicao: { nome: string };
  };
};

export type OpcaoColaborador = { id: string; nome: string };

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
  const [erro, setErro] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const [colaboradorId, setColaboradorId] = useState("");
  const [dataFato, setDataFato] = useState("");
  const [tipo, setTipo] = useState<"INCLUSAO_MANUAL" | "ABONO_ATESTADO" | "JUSTIFICATIVA" | "CORRECAO">("INCLUSAO_MANUAL");
  const [motivo, setMotivo] = useState("");

  const handleSalvarTratamento = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro(null);

    const res = await registrarTratamentoPonto({
      empresaId,
      colaboradorId,
      dataFato: new Date(dataFato),
      tipo,
      motivo,
    });

    if (res.erro) {
      setErro(res.erro);
    } else {
      setModalAberta(false);
      setMotivo("");
      setColaboradorId("");
      setDataFato("");
      // Sem isto a lista abaixo continua mostrando o estado antigo: o
      // revalidatePath da action limpa o cache do servidor, mas este componente
      // é cliente e segue com as props que já tinha (mesma causa do defeito da
      // ficha corrigido em v1.63.6).
      router.refresh();
    }
    setLoading(false);
  };

  const handleDecidir = async (id: string, decisao: "APROVADO" | "REJEITADO") => {
    let motivoDecisao: string | undefined;
    if (decisao === "REJEITADO") {
      const escrito = window.prompt("Motivo da rejeição (fica registrado na auditoria):");
      if (escrito === null) return; // desistiu
      motivoDecisao = escrito;
    }
    setDecidindo(id);
    setErro(null);
    const res = await decidirTratamentoPonto({ empresaId, tratamentoId: id, decisao, motivoDecisao });
    if (res.erro) setErro(res.erro);
    else router.refresh();
    setDecidindo(null);
  };

  const tipoLabel = (tipo: string) => {
    switch (tipo) {
      case "INCLUSAO_MANUAL":
        return "Inclusão Manual";
      case "ABONO_ATESTADO":
        return "Abono p/ Atestado Médico";
      case "JUSTIFICATIVA":
        return "Justificativa de Ausência";
      case "CORRECAO":
        return "Correção de Marcação";
      default:
        return tipo;
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
        <Button size="sm" onClick={() => setModalAberta(true)} className="gap-1 text-xs">
          <FileEdit className="w-4 h-4" /> Novo Ajuste / Abono
        </Button>
      </div>

      {modalAberta && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Registrar Tratamento de Ponto (PTRP)</CardTitle>
            {/* O texto anterior dizia "assinado digitalmente pelo RH" — não
                havia assinatura, e o aprovador gravado era a string fixa
                "Gestor de RH". Descrever o que o sistema FAZ: registra quem
                decidiu, quando, com justificativa. */}
            <CardDescription className="text-xs">
              O ajuste entra como pendente e só vale depois de aprovado. Fica registrado quem pediu,
              quem decidiu, quando e por quê — as batidas originais nunca são alteradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarTratamento} className="space-y-3">
              {erro && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{erro}</div>}
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
                <Button type="button" variant="outline" size="sm" onClick={() => setModalAberta(false)} className="text-xs">
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
                <div key={t.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t.colaborador.nome}</span>
                      <Badge variant="outline" className="text-[10px]">{tipoLabel(t.tipo)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.colaborador.setor.nome} · Data: {new Date(t.dataFato).toLocaleDateString("pt-BR")}
                    </p>
                    {/* whitespace-pre-line: o motivo da rejeição é anexado ao
                        texto original com quebra de linha (ver
                        decidirTratamentoPonto) e sem isto viraria um parágrafo
                        só, colado. */}
                    <p className="text-xs whitespace-pre-line text-foreground italic">
                      &ldquo;{t.motivo}&rdquo;
                    </p>
                  </div>
                  {/* Antes esta coluna escrevia "Aprovado · Por: RH" em TODA
                      linha, ignorando t.status e caindo em "RH" quando não
                      havia aprovador. Num histórico que existe para auditoria,
                      dizer aprovado sobre o que não foi é o pior defeito
                      possível — mostra o estado real, e só. */}
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {t.status === "APROVADO" && (
                      <>
                        <span className="flex items-center justify-end gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
                        </span>
                        <span className="mt-0.5 block text-[10px]">
                          Por: {t.aprovadoPorNome ?? "—"}
                        </span>
                      </>
                    )}
                    {t.status === "REJEITADO" && (
                      <>
                        <span className="flex items-center justify-end gap-1 font-semibold text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> Rejeitado
                        </span>
                        <span className="mt-0.5 block text-[10px]">
                          Por: {t.aprovadoPorNome ?? "—"}
                        </span>
                      </>
                    )}
                    {t.status === "PENDENTE" && (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="flex items-center gap-1 font-semibold text-warning">
                          <Clock3 className="h-3.5 w-3.5" /> Aguardando decisão
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            disabled={decidindo === t.id}
                            onClick={() => handleDecidir(t.id, "REJEITADO")}
                          >
                            Rejeitar
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={decidindo === t.id}
                            onClick={() => handleDecidir(t.id, "APROVADO")}
                          >
                            {decidindo === t.id ? "..." : "Aprovar"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
