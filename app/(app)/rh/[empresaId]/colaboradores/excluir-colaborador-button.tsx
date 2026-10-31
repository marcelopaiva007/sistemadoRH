"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteColaborador } from "@/lib/actions/rh-colaboradores";

/**
 * Apagar a ficha de vez — no menu "Ações" da ficha, não na lista.
 *
 * Até a v1.182.0 a lixeira vermelha ficava em TODA linha de Colaboradores,
 * colada no lápis de editar: o comando mais destrutivo da tela era o mais
 * fácil de acertar sem querer, numa lista de centenas de linhas. E quase nunca
 * é o que se quer — quem saiu da empresa é DESATIVADO (a ficha e o histórico
 * ficam); excluir é para cadastro feito por engano. Na ficha, a pessoa já
 * conferiu de quem se trata antes de chegar ao botão.
 *
 * A action não mudou: ela continua recusando ficha com resposta de pesquisa,
 * recibo confirmado ou qualquer registro vinculado, e mandando desativar.
 */
export function ExcluirColaboradorButton({
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
    const r = await deleteColaborador(empresaId, colaboradorId);
    setSalvando(false);
    if (r.ok) {
      toast.success("Ficha excluída.");
      // A ficha deixou de existir: ficar aqui seria um 404 no próximo clique.
      router.push(`/rh/${empresaId}/colaboradores`);
    } else {
      setConfirmando(false);
      toast.error(r.error);
    }
  }

  if (confirmando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-destructive">
          Apagar a ficha de {nome.split(" ")[0]}? Não tem volta.
        </span>
        <Button size="sm" variant="destructive" disabled={salvando} onClick={confirmar}>
          {salvando ? "..." : "Excluir"}
        </Button>
        <Button size="sm" variant="ghost" disabled={salvando} onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      title="Apagar a ficha de vez — só para cadastro feito por engano. Quem saiu da empresa é desativado."
      onClick={() => setConfirmando(true)}
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="size-4" />
      Excluir ficha
    </Button>
  );
}
