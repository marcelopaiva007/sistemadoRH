"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cobrarCadastro } from "@/lib/actions/rh-cobranca-cadastro";

/**
 * Dispara a cobrança de cadastro na hora, para uma pessoa (ficha) ou para as
 * selecionadas (lista).
 *
 * Confirma antes porque manda mensagem para gente de verdade e não tem desfazer
 * — mesmo cuidado do AtivarDesativarButton ao lado. A confirmação diz QUANTAS
 * pessoas vão receber, que é a informação que evita o clique errado num lote.
 *
 * O resultado nunca é só "pronto": a action devolve quem não recebeu e por quê
 * (ficha já completa, sem canal, envio recusado), e um sucesso liso escondendo
 * 5 falhas em 30 envios faria o RH acreditar que cobrou quem não cobrou.
 */
export function CobrarCadastroButton({
  empresaId,
  colaboradorIds,
  rotulo,
  variant = "outline",
  onEnviado,
}: {
  empresaId: string;
  colaboradorIds: string[];
  rotulo?: string;
  variant?: "outline" | "default" | "ghost";
  /** A lista usa para limpar a seleção depois do envio. */
  onEnviado?: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const quantos = colaboradorIds.length;

  async function confirmar() {
    setEnviando(true);
    const r = await cobrarCadastro(empresaId, colaboradorIds);
    setEnviando(false);
    setConfirmando(false);

    if (!r.ok) {
      toast.error(r.error);
      return;
    }

    const falhas = r.falhas ?? [];
    if (falhas.length === 0) {
      toast.success(r.enviados === 1 ? "Cobrança enviada." : `Cobrança enviada para ${r.enviados} pessoas.`);
    } else {
      // Um toast por falha viraria empilhamento ilegível num lote grande; o
      // primeiro motivo já diz o tipo do problema, e o número diz o tamanho.
      toast.warning(
        `${r.enviados} cobrada(s), ${falhas.length} não. Primeiro motivo: ${falhas[0].nome} — ${falhas[0].motivo}`,
        { duration: 10_000 },
      );
    }
    onEnviado?.();
  }

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          {quantos === 1 ? "Cobrar agora?" : `Cobrar ${quantos} pessoas agora?`}
        </span>
        <Button size="sm" disabled={enviando} onClick={confirmar}>
          {enviando ? "Enviando..." : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={quantos === 0}
      title="Manda a cobrança agora, por Telegram e e-mail, sem esperar a rodada automática"
      onClick={() => setConfirmando(true)}
    >
      <Send className="size-4" />
      {rotulo ?? "Cobrar cadastro"}
    </Button>
  );
}
