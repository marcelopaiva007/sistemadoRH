"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { alterarStatusPesquisa, deletePesquisa } from "@/lib/actions/pesquisas";
import { statusPesquisaLabel } from "@/lib/constants-rh";

const PROXIMO_STATUS: Record<string, string | null> = {
  DRAFT: "ACTIVE",
  ACTIVE: "FINISHED",
  FINISHED: "ARCHIVED",
  ARCHIVED: null,
};

/**
 * Status e exclusão da pesquisa — mora no cabeçalho, que é comum às quatro
 * telas: são ações sobre a campanha inteira, não sobre o que está aberto.
 */
export function AcoesPesquisa({
  empresaId,
  pesquisaId,
  status,
}: {
  empresaId: string;
  pesquisaId: string;
  status: string;
}) {
  const proximo = PROXIMO_STATUS[status];

  async function avancarStatus() {
    if (!proximo) return;
    const result = await alterarStatusPesquisa(
      empresaId,
      pesquisaId,
      proximo as "ACTIVE" | "FINISHED" | "ARCHIVED",
    );
    if (result.ok) toast.success(`Pesquisa marcada como "${statusPesquisaLabel(proximo)}".`);
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{statusPesquisaLabel(status)}</Badge>
      {proximo && (
        <Button type="button" size="sm" variant="outline" onClick={avancarStatus}>
          Marcar como {statusPesquisaLabel(proximo)}
        </Button>
      )}
      <ExcluirPesquisaButton empresaId={empresaId} pesquisaId={pesquisaId} />
    </div>
  );
}

// Exclusão em duas etapas: primeiro clique arma a confirmação (com o alerta de
// que convites e respostas vão junto), segundo clique executa. Em caso de
// sucesso a action redireciona para a lista de pesquisas.
function ExcluirPesquisaButton({ empresaId, pesquisaId }: { empresaId: string; pesquisaId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-destructive">Excluir campanha, convites e respostas?</span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={excluindo}
          onClick={async () => {
            setExcluindo(true);
            const result = await deletePesquisa(empresaId, pesquisaId);
            // só volta aqui em erro — no sucesso a action redireciona
            setExcluindo(false);
            if (result && !result.ok) toast.error(result.error);
          }}
        >
          {excluindo ? "Excluindo..." : "Confirmar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
      <Trash2 className="size-4" />
      Excluir
    </Button>
  );
}
