"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toggleColaboradorAtivo } from "@/lib/actions/rh-colaboradores";
import { MOTIVOS_DESLIGAMENTO } from "@/lib/constants-dp";

/**
 * Desativar/reativar com confirmação no lugar do botão.
 *
 * Desativar é a saída certa para quem não é mais funcionário — a ficha e o
 * histórico ficam — e é o que tira a pessoa do total de colaboradores, das
 * pendências, dos benefícios, das férias e dos convites de pesquisa. Grande
 * demais para acontecer num clique sem pergunta, que era o caso enquanto a
 * ação morava escondida no badge de status da tabela.
 *
 * Desativar agora pede o motivo. Este botão é o caminho real por onde a
 * maioria dos desligamentos acontece (é um clique, contra abrir a ficha e
 * preencher o bloco "Vínculo") — sem o motivo aqui, `motivoDesligamento`
 * nunca é gravado nesse caminho, que é exatamente por que 137 de 137
 * desligados estavam com o campo vazio antes desta mudança.
 *
 * Mora na lista e na ficha: quem abre a ficha para conferir quem é a pessoa é
 * justamente quem decide desativá-la, e voltar para a lista só para isso é
 * caminho longo.
 */
export function AtivarDesativarButton({
  empresaId,
  id,
  ativo,
  comRotulo = false,
}: {
  empresaId: string;
  id: string;
  ativo: boolean;
  /** Com texto (ficha) ou só ícone (lista, onde a coluna é estreita). */
  comRotulo?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function confirmar() {
    setSalvando(true);
    const result = await toggleColaboradorAtivo(empresaId, id, !ativo, ativo ? motivo : undefined);
    setSalvando(false);
    if (result.ok) {
      setConfirmando(false);
      setMotivo("");
      toast.success(ativo ? "Colaborador desativado." : "Colaborador reativado.");
    } else {
      toast.error(result.error);
    }
  }

  const titulo = ativo
    ? "Desativar — sai do total de colaboradores, das pendências e dos convites; a ficha fica"
    : "Reativar — volta a contar como colaborador ativo";

  if (confirmando) {
    // Desligar pede motivo; reativar continua no confirma-num-clique de antes.
    if (ativo) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Select value={motivo} onValueChange={(v) => setMotivo(v ?? "")} items={Object.fromEntries(MOTIVOS_DESLIGAMENTO.map((m) => [m.value, m.label]))}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Motivo do desligamento" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_DESLIGAMENTO.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="destructive" disabled={salvando || !motivo} onClick={confirmar}>
            {salvando ? "..." : "Confirmar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirmando(false);
              setMotivo("");
            }}
          >
            Cancelar
          </Button>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Reativar?</span>
        <Button size="sm" variant="default" disabled={salvando} onClick={confirmar}>
          {salvando ? "..." : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  const Icone = ativo ? UserMinus : UserCheck;

  return (
    <Button
      variant={comRotulo ? "outline" : "ghost"}
      size={comRotulo ? "sm" : "icon"}
      title={titulo}
      onClick={() => setConfirmando(true)}
    >
      <Icone className="size-4" />
      {comRotulo && (ativo ? "Desativar" : "Reativar")}
    </Button>
  );
}
