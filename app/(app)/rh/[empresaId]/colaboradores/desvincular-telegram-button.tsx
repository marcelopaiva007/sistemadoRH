"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { desvincularTelegram } from "@/lib/actions/rh-colaboradores";

/**
 * Etiqueta "Telegram vinculado" com a opção de soltar o vínculo.
 *
 * POR QUE EXISTE. Quando um colaborador tenta entrar no portal e o bot
 * responde "este Telegram já está vinculado a Fulano", a saída é soltar o
 * vínculo na ficha de Fulano. Até 13/08/2026 a ficha só EXIBIA a etiqueta — a
 * mensagem do bot mandava o colaborador procurar o RH para uma correção que
 * não existia em tela nenhuma, e ele ficava sem portal por tempo
 * indeterminado.
 *
 * Confirmação inline (mesmo padrão do AtivarDesativarButton) porque o efeito
 * não é óbvio pelo nome do botão: a pessoa DESTA ficha perde o acesso ao
 * portal até vincular de novo.
 */
export function DesvincularTelegramButton({
  empresaId,
  colaboradorId,
  nome,
}: {
  empresaId: string;
  colaboradorId: string;
  nome: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const r = await desvincularTelegram(empresaId, colaboradorId);
    setSalvando(false);
    if (r.ok) {
      setConfirmando(false);
      toast.success("Telegram desvinculado. O aparelho está livre para outra pessoa vincular.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  if (confirmando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          {nome.split(" ")[0]} perde o acesso ao portal até vincular de novo. Desvincular?
        </span>
        <Button size="sm" variant="destructive" disabled={salvando} onClick={confirmar}>
          {salvando ? "..." : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={salvando} onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1.5">
      Telegram vinculado
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title="Desvincular este Telegram da ficha — libera o aparelho para outra pessoa"
        aria-label={`Desvincular o Telegram de ${nome}`}
        className="opacity-70 transition-opacity hover:opacity-100"
      >
        <Unlink className="size-3" />
      </button>
    </Badge>
  );
}
