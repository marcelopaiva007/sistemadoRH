"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Megaphone, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { darCienciaInformativo } from "@/lib/actions/portal-informativos";
import { formatarData } from "@/lib/datas";

export type InformativoPendente = {
  /** Id do destinatário (a linha desta pessoa), não do informativo. */
  id: string;
  titulo: string;
  mensagem: string;
  enviadoEm: Date;
};

/**
 * Informativos do RH que a pessoa ainda não marcou como lidos. Fica no TOPO,
 * como o cartão de entregas: é o lugar onde quem não tem Telegram nem e-mail
 * encontra o comunicado, e onde quem recebeu por e-mail dá a ciência.
 */
export function InformativosCard({ informativos }: { informativos: InformativoPendente[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (informativos.length === 0) return null;

  async function ciente(id: string) {
    setConfirmando(id);
    const r = await darCienciaInformativo(id);
    setConfirmando(null);
    if (r.ok) {
      toast.success("Ciência registrada. Obrigado!");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-primary" />
          {informativos.length === 1 ? "Informativo do RH" : `${informativos.length} informativos do RH`}
        </CardTitle>
        <CardDescription className="text-xs">Leia e confirme que está ciente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {informativos.map((i) => (
          <div key={i.id} className="space-y-2 rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{i.titulo}</p>
              <span className="text-xs text-muted-foreground">{formatarData(i.enviadoEm)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{i.mensagem}</p>
            <Button type="button" size="sm" disabled={confirmando !== null} onClick={() => ciente(i.id)}>
              <Check className="size-3.5" />
              {confirmando === i.id ? "Registrando…" : "Li e estou ciente"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
