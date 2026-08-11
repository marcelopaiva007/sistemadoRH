"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adicionarHorarioLembrete,
  alternarHorarioLembrete,
  removerHorarioLembrete,
} from "@/lib/actions/rh-lembretes";
import type { ChaveLembrete } from "@/lib/cron-horario";

type Lembrete = {
  chave: ChaveLembrete;
  label: string;
  padroes: readonly string[];
  horarios: { id: string; horario: string; ativo: boolean }[];
};

export function LembretesView({
  empresaId,
  lembretes,
  podeConfigurar,
}: {
  empresaId: string;
  lembretes: Lembrete[];
  podeConfigurar: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Lembretes</h2>
        <p className="text-sm text-muted-foreground">
          Horário dos avisos automáticos (fuso de Brasília). O sistema confere a cada 15 minutos se
          é a hora configurada — mudar aqui não precisa de deploy nem mexe no que já está agendado
          para hoje em andamento.
        </p>
      </div>

      {!podeConfigurar && (
        <Alert>
          <AlertDescription>
            Só a administração ou a diretoria pode alterar horário de lembrete. Os horários abaixo
            são só para consulta.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {lembretes.map((l) => (
          <CartaoLembrete key={l.chave} empresaId={empresaId} lembrete={l} podeConfigurar={podeConfigurar} />
        ))}
      </div>
    </div>
  );
}

function CartaoLembrete({
  empresaId,
  lembrete,
  podeConfigurar,
}: {
  empresaId: string;
  lembrete: Lembrete;
  podeConfigurar: boolean;
}) {
  const router = useRouter();
  const [novoHorario, setNovoHorario] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const usandoPadrao = lembrete.horarios.length === 0;
  const exibidos = usandoPadrao
    ? lembrete.padroes.map((h, i) => ({ id: `padrao-${i}`, horario: h, ativo: true, ehPadrao: true }))
    : lembrete.horarios.map((h) => ({ ...h, ehPadrao: false }));

  async function adicionar() {
    if (!novoHorario.trim() || ocupado) return;
    setOcupado(true);
    try {
      const r = await adicionarHorarioLembrete(empresaId, lembrete.chave, novoHorario);
      if (r.ok) {
        setNovoHorario("");
        toast.success(`Horário adicionado a "${lembrete.label}".`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    setOcupado(true);
    try {
      const r = await removerHorarioLembrete(empresaId, id);
      if (r.ok) {
        toast.success("Horário removido.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível remover — verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function alternar(id: string, ativo: boolean) {
    setOcupado(true);
    try {
      const r = await alternarHorarioLembrete(empresaId, id, ativo);
      if (r.ok) {
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4" />
          {lembrete.label}
        </CardTitle>
        {usandoPadrao && (
          <CardDescription>Usando o horário padrão — ainda não foi ajustado pela tela.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {exibidos.map((h) => (
            <Badge
              key={h.id}
              variant={h.ativo ? "secondary" : "outline"}
              className={`gap-1.5 py-1 pr-1 pl-2.5 text-sm ${!h.ativo ? "text-muted-foreground line-through" : ""}`}
            >
              {h.horario}
              {podeConfigurar && !h.ehPadrao && (
                <>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => alternar(h.id, !h.ativo)}
                    className="rounded px-1 text-xs no-underline hover:bg-muted-foreground/20"
                    title={h.ativo ? "Pausar este horário" : "Reativar este horário"}
                  >
                    {h.ativo ? "pausar" : "ativar"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => remover(h.id)}
                    className="rounded p-0.5 hover:bg-muted-foreground/20"
                    title="Remover este horário"
                  >
                    <X className="size-3" />
                  </button>
                </>
              )}
            </Badge>
          ))}
        </div>

        {podeConfigurar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              adicionar();
            }}
            className="flex gap-2"
          >
            <Input
              value={novoHorario}
              onChange={(e) => setNovoHorario(e.target.value)}
              placeholder="HH:mm, ex.: 09:30"
              className="max-w-32"
              disabled={ocupado}
            />
            <Button type="submit" size="sm" variant="outline" disabled={ocupado || !novoHorario.trim()}>
              <Plus className="size-3.5" />
              Adicionar horário
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
