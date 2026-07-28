"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleColaboradorAtivo } from "@/lib/actions/rh-colaboradores";

/**
 * Desativar/reativar com confirmação no lugar do botão.
 *
 * Desativar é a saída certa para quem não é mais funcionário — a ficha e o
 * histórico ficam — e é o que tira a pessoa do total de colaboradores, das
 * pendências, dos benefícios, das férias e dos convites de pesquisa. Grande
 * demais para acontecer num clique sem pergunta, que era o caso enquanto a
 * ação morava escondida no badge de status da tabela.
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

  async function confirmar() {
    setSalvando(true);
    const result = await toggleColaboradorAtivo(empresaId, id, !ativo);
    setSalvando(false);
    setConfirmando(false);
    if (result.ok) toast.success(ativo ? "Colaborador desativado." : "Colaborador reativado.");
    else toast.error(result.error);
  }

  const titulo = ativo
    ? "Desativar — sai do total de colaboradores, das pendências e dos convites; a ficha fica"
    : "Reativar — volta a contar como colaborador ativo";

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{ativo ? "Desativar?" : "Reativar?"}</span>
        <Button
          size="sm"
          variant={ativo ? "destructive" : "default"}
          disabled={salvando}
          onClick={confirmar}
        >
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
