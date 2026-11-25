"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salvarIndicadoresNegocio } from "@/lib/actions/desligamentos-config";
import type { LinhaAno } from "@/lib/desligamentos/analises";
import { CampoTexto, FormularioAction } from "../../colaboradores/[colaboradorId]/campos";

/**
 * Crescimento de clientes e de faturamento por ano — o sistema não tem essa
 * informação, então a diretoria digita. Vale para o grupo inteiro.
 */
export function CrescimentoNegocioDialog({
  empresaId,
  anos,
  podeConfigurar,
}: {
  empresaId: string;
  anos: LinhaAno[];
  podeConfigurar: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const fmt = (n: number | null) => (n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

  if (!podeConfigurar) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <TrendingUp className="size-4" />
        Crescimento do negócio
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crescimento do negócio</DialogTitle>
            <DialogDescription>
              Quanto a base de clientes e o faturamento cresceram em cada ano, em % sobre o ano anterior (negativo se
              caiu). Deixe em branco o que não souber.
            </DialogDescription>
          </DialogHeader>
          <FormularioAction
            action={salvarIndicadoresNegocio.bind(null, empresaId)}
            textoBotao="Salvar"
            mensagemSucesso="Crescimento do negócio salvo."
            onSuccess={() => {
              setAberto(false);
              router.refresh();
            }}
          >
            {anos.map((a) => (
              <fieldset key={a.ano} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
                <legend className="text-sm font-semibold">{a.ano}</legend>
                <div className="grid grid-cols-2 gap-3">
                  <CampoTexto
                    name={`clientes_${a.ano}`}
                    label="Clientes (%)"
                    defaultValue={fmt(a.crescimentoClientesPct)}
                    inputMode="decimal"
                    placeholder="ex.: 4,5"
                  />
                  <CampoTexto
                    name={`faturamento_${a.ano}`}
                    label="Faturamento (%)"
                    defaultValue={fmt(a.crescimentoFaturamentoPct)}
                    inputMode="decimal"
                    placeholder="ex.: 2"
                  />
                </div>
                <CampoTexto name={`observacao_${a.ano}`} label="Observação (opcional)" defaultValue={a.observacao ?? ""} maxLength={300} />
              </fieldset>
            ))}
          </FormularioAction>
        </DialogContent>
      </Dialog>
    </>
  );
}
