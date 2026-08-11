"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { enviarMensagemAoRh } from "@/lib/actions/portal-mensagens";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const inicial: ActionResult = { ok: true };

export type MensagemDoPortal = {
  id: string;
  mensagem: string;
  resposta: string | null;
  respondidaEm: Date | null;
  respondidaPorNome: string | null;
  createdAt: Date;
};

export function FaleComRh({ mensagens }: { mensagens: MensagemDoPortal[] }) {
  const [, acao, enviando] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await enviarMensagemAoRh(prev, fd);
    if (r.ok) toast.success("Mensagem enviada. O RH responde por aqui mesmo.");
    else toast.error(r.error);
    return r;
  }, inicial);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fale com o RH</CardTitle>
          <CardDescription>
            Dúvida, pedido ou aviso — escreva aqui. A resposta aparece nesta mesma tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acao} className="space-y-3">
            <Textarea
              name="mensagem"
              required
              maxLength={2000}
              rows={4}
              placeholder="Escreva sua mensagem para o RH..."
            />
            <Button type="submit" disabled={enviando} className="w-full">
              <Send className="size-4" />
              {enviando ? "Enviando..." : "Enviar para o RH"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {mensagens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suas mensagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mensagens.map((m) => (
              <div key={m.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatarData(m.createdAt)}
                  </span>
                  {m.respondidaEm ? (
                    <Badge variant="default">Respondida</Badge>
                  ) : (
                    <Badge variant="secondary">Aguardando o RH</Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.mensagem}</p>
                {m.resposta && (
                  <div className="rounded-md bg-muted p-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Resposta do RH{m.respondidaPorNome ? ` · ${m.respondidaPorNome}` : ""}
                      {m.respondidaEm ? ` · ${formatarData(m.respondidaEm)}` : ""}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.resposta}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
