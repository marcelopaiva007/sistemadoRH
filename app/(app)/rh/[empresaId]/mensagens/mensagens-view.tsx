"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { responderMensagemPortal } from "@/lib/actions/rh-mensagens";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const inicial: ActionResult = { ok: true };

type Mensagem = {
  id: string;
  mensagem: string;
  resposta: string | null;
  respondidaEm: Date | null;
  respondidaPorNome: string | null;
  createdAt: Date;
  colaboradorNome: string;
  setor: string;
  empresa: string;
};

export function MensagensView({
  empresaId,
  mensagens,
}: {
  empresaId: string;
  mensagens: Mensagem[];
}) {
  const abertas = mensagens.filter((m) => !m.respondidaEm);
  const respondidas = mensagens.filter((m) => m.respondidaEm);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MessageCircle className="size-5" />
          Mensagens do portal
        </h1>
        <p className="text-sm text-muted-foreground">
          O que os colaboradores mandam pelo Fale com o RH. A resposta aparece no portal da pessoa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aguardando resposta</CardTitle>
          <CardDescription>
            {abertas.length === 0
              ? "Nenhuma mensagem em aberto."
              : `${abertas.length} mensagem(ns) esperando o RH.`}
          </CardDescription>
        </CardHeader>
        {abertas.length > 0 && (
          <CardContent className="space-y-4">
            {abertas.map((m) => (
              <MensagemAberta key={m.id} empresaId={empresaId} m={m} />
            ))}
          </CardContent>
        )}
      </Card>

      {respondidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Respondidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {respondidas.map((m) => (
              <div key={m.id} className="space-y-2 rounded-lg border p-3">
                <Cabecalho m={m} />
                <p className="text-sm whitespace-pre-wrap">{m.mensagem}</p>
                <div className="rounded-md bg-muted p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {m.respondidaPorNome ?? "RH"}
                    {m.respondidaEm ? ` · ${formatarData(m.respondidaEm)}` : ""}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.resposta}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Cabecalho({ m }: { m: Mensagem }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-medium">
        {m.colaboradorNome}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {m.setor} · {m.empresa}
        </span>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{formatarData(m.createdAt)}</span>
    </div>
  );
}

function MensagemAberta({ empresaId, m }: { empresaId: string; m: Mensagem }) {
  const [, acao, enviando] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await responderMensagemPortal(prev, fd);
    if (r.ok) toast.success("Resposta enviada ao portal do colaborador.");
    else toast.error(r.error);
    return r;
  }, inicial);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Cabecalho m={m} />
        <Badge variant="secondary">Aberta</Badge>
      </div>
      <p className="text-sm whitespace-pre-wrap">{m.mensagem}</p>
      <form action={acao} className="space-y-2">
        <input type="hidden" name="empresaId" value={empresaId} />
        <input type="hidden" name="mensagemId" value={m.id} />
        <Textarea name="resposta" required maxLength={2000} rows={3} placeholder="Escreva a resposta..." />
        <Button type="submit" size="sm" disabled={enviando}>
          <Send className="size-4" />
          {enviando ? "Enviando..." : "Responder"}
        </Button>
      </form>
    </div>
  );
}
