"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmarRecebimento } from "@/lib/actions/portal-entregas";
import { formatarData } from "@/lib/datas";
import { tipoEntregaLabel } from "@/lib/constants-entregas";

export type EntregaAConfirmar = {
  id: string;
  tipo: string;
  descricao: string | null;
  dataEntrega: Date;
};

/**
 * "Confirme o que você recebeu" — o cartão só aparece quando há algo pendente.
 *
 * Fica no TOPO do portal, acima das abas, pelo mesmo motivo do cartão de bater
 * ponto: é ação com prazo, não consulta. Enterrado numa aba, ninguém acha, e o
 * RH fica sem a confirmação que precisa para fechar a entrega.
 */
export function ConfirmarEntregasCard({ entregas }: { entregas: EntregaAConfirmar[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (entregas.length === 0) return null;

  async function confirmar(id: string, rotulo: string) {
    setConfirmando(id);
    const r = await confirmarRecebimento(id);
    setConfirmando(null);
    if (r.ok) {
      toast.success(`Recebimento de ${rotulo} confirmado. Obrigado!`);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="size-4 text-primary" />
          {entregas.length === 1 ? "Confirme o que você recebeu" : `Confirme ${entregas.length} itens que você recebeu`}
        </CardTitle>
        <CardDescription className="text-xs">
          O RH registrou estas entregas em seu nome. Confirme só o que estiver de fato com você — se
          algo não chegou, fale com o RH antes de confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entregas.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{tipoEntregaLabel(e.tipo)}</p>
              <p className="text-xs text-muted-foreground">
                {e.descricao ? `${e.descricao} · ` : ""}
                entregue em {formatarData(e.dataEntrega)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={confirmando !== null}
              onClick={() => confirmar(e.id, tipoEntregaLabel(e.tipo))}
            >
              <Check className="size-3.5" />
              {confirmando === e.id ? "Confirmando…" : "Recebi"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
