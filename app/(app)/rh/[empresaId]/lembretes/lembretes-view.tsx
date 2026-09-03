"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Play, Power, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adicionarHorarioLembrete,
  alternarHorarioLembrete,
  removerHorarioLembrete,
  definirEnvioAutomatico,
} from "@/lib/actions/rh-lembretes";
import { rodarCobrancaAgora } from "@/lib/actions/rh-cobranca-cadastro";
import type { ChaveLembrete } from "@/lib/cron-horario";

type Lembrete = {
  chave: ChaveLembrete;
  label: string;
  padroes: readonly string[];
  horarios: { id: string; horario: string; ativo: boolean }[];
  /** Nasce desligado: sem decisão da gestão, o envio automático não acontece. */
  precisaDecisaoDaGestao: boolean;
  ligado: boolean;
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
        <h1>Lembretes</h1>
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

  async function ligarDesligar(ligado: boolean) {
    setOcupado(true);
    try {
      const r = await definirEnvioAutomatico(empresaId, lembrete.chave, ligado);
      if (r.ok) {
        toast.success(
          ligado
            ? `Envio automático de "${lembrete.label}" ligado.`
            : `Envio automático de "${lembrete.label}" desligado.`,
        );
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
          {lembrete.precisaDecisaoDaGestao && (
            <Badge variant={lembrete.ligado ? "default" : "outline"} className="ml-auto">
              {lembrete.ligado ? "Automático ligado" : "Automático desligado"}
            </Badge>
          )}
        </CardTitle>
        {/* Para quem nasce desligado, "usando o padrão" seria mentira: sem
            decisão da gestão o horário padrão não vale como autorização e nada
            sai. Só os demais mostram aquele aviso. */}
        {usandoPadrao && !lembrete.precisaDecisaoDaGestao && (
          <CardDescription>Usando o horário padrão — ainda não foi ajustado pela tela.</CardDescription>
        )}
        {lembrete.precisaDecisaoDaGestao && (
          <CardDescription>
            {lembrete.ligado
              ? "O sistema envia sozinho, nos horários abaixo."
              : "O sistema NÃO envia sozinho. O RH continua podendo cobrar à mão, pela ficha do colaborador e pela lista."}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {lembrete.precisaDecisaoDaGestao && podeConfigurar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <Power className="size-4 text-muted-foreground" />
            <span className="text-sm">
              Envio automático: <b>{lembrete.ligado ? "ligado" : "desligado"}</b>
            </span>
            <Button
              size="sm"
              variant={lembrete.ligado ? "outline" : "default"}
              disabled={ocupado}
              onClick={() => ligarDesligar(!lembrete.ligado)}
              className="ml-auto"
            >
              {lembrete.ligado ? "Desligar" : "Ligar"}
            </Button>
          </div>
        )}

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

        {/* Só a cobrança de cadastro tem disparo manual por enquanto. Os outros
            crons continuam sem: convite e lembrete de pesquisa dependem de uma
            campanha aberta e já têm botão na tela da própria pesquisa, e
            alertas-rh/lembrete-portal não têm quem peça "roda agora". */}
        {podeConfigurar && lembrete.chave === "cobranca-cadastro" && (
          <RodarCobrancaAgora empresaId={empresaId} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Dispara a rodada inteira fora do horário.
 *
 * RESPEITA as regras de sempre — só cobra quem está na vez, dentro do teto.
 * Não é o botão da ficha do colaborador, que ignora as travas de propósito:
 * aquilo é decisão sobre uma pessoa; isto é antecipar o relógio da campanha, e
 * furar as travas aqui atropelaria a cadência de todo mundo de uma vez.
 */
function RodarCobrancaAgora({ empresaId }: { empresaId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);

  async function confirmar() {
    setRodando(true);
    const r = await rodarCobrancaAgora(empresaId);
    setRodando(false);
    setConfirmando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (r.enviados === 0) {
      // Zero é resultado legítimo e o mais provável fora da janela: ninguém
      // está na vez. Dizer "0 enviadas" sem explicar pareceria falha.
      toast.info(
        `Ninguém estava na vez agora — ${r.aguardandoPrazo} dentro do intervalo, ${r.esgotados} já sem rodada.`,
        { duration: 8000 },
      );
      return;
    }
    toast.success(
      `${r.enviados} pessoa(s) cobrada(s) — ${r.porTelegram} por Telegram, ${r.porEmail} por e-mail.`,
      { duration: 8000 },
    );
  }

  if (confirmando) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          Rodar agora? Manda para todos que estiverem na vez, sem esperar o horário.
        </span>
        <Button size="sm" disabled={rodando} onClick={confirmar}>
          {rodando ? "Rodando..." : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={rodando} onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t pt-3">
      <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
        <Play className="size-3.5" />
        Rodar agora
      </Button>
    </div>
  );
}
