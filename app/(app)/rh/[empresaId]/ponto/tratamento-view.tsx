"use client";

import { useState } from "react";
import { FileEdit, ShieldAlert, CheckCircle2, XCircle, Search, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registrarTratamentoPonto } from "@/app/actions/rh-ponto";

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

export function TratamentoView({ empresaId, tratamentos }: { empresaId: string; tratamentos: TratamentoItem[] }) {
  const [modalAberta, setModalAberta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
      aprovadoPorId: "rh-admin",
      aprovadoPorNome: "Gestor de RH",
    });

    if (res.erro) {
      setErro(res.erro);
    } else {
      setModalAberta(false);
      setMotivo("");
    }
    setLoading(false);
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
            <CardDescription className="text-xs">
              Todo ajuste fica auditado e assinado digitalmente pelo RH com justificativa explícita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSalvarTratamento} className="space-y-3">
              {erro && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{erro}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">ID do Colaborador</Label>
                  <Input
                    placeholder="Cole ou selecione o ID do funcionário"
                    value={colaboradorId}
                    onChange={(e) => setColaboradorId(e.target.value)}
                    className="h-8 text-xs mt-1"
                    required
                  />
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
                    onChange={(e: any) => setTipo(e.target.value)}
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
                    <p className="text-xs text-foreground italic">"{t.motivo}"</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                    </span>
                    <span className="text-[10px] block mt-0.5">Por: {t.aprovadoPorNome || "RH"}</span>
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
