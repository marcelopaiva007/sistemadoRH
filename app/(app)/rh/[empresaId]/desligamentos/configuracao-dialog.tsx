"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salvarConfiguracaoDesligamentos } from "@/lib/actions/desligamentos-config";
import type { ConfigDaArea } from "@/lib/desligamentos/painel";
import { CampoTexto, FormularioAction } from "../colaboradores/[colaboradorId]/campos";

/**
 * Meta, limite e custo por desligamento do cliente. Os números que a diretoria
 * usa para cobrar os gestores não ficam gravados no código: cada cliente tem
 * os seus (ConfiguracaoDesligamentos). Quem não pode mudar vê os valores.
 */
export function ConfiguracaoDesligamentosDialog({
  empresaId,
  config,
  podeConfigurar,
}: {
  empresaId: string;
  config: ConfigDaArea;
  podeConfigurar: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const formatar = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Settings2 className="size-4" />
        {podeConfigurar ? "Meta e custo" : "Ver meta e custo"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meta e custo dos desligamentos</DialogTitle>
            <DialogDescription>
              Valem para todas as empresas do grupo.{" "}
              {config.personalizada ? "Definidos pela diretoria." : "Ainda nos valores padrão (10%, 15% e R$ 4.000)."}
            </DialogDescription>
          </DialogHeader>
          {podeConfigurar ? (
            <FormularioAction
              action={salvarConfiguracaoDesligamentos.bind(null, empresaId)}
              textoBotao="Salvar"
              mensagemSucesso="Configuração salva."
              onSuccess={() => {
                setAberto(false);
                router.refresh();
              }}
            >
              <CampoTexto
                name="custo"
                label="Custo mínimo por desligamento (R$)"
                defaultValue={formatar(config.custoPorDesligamento)}
                inputMode="decimal"
                required
              />
              <CampoTexto
                name="meta"
                label="Meta anual (% do quadro médio)"
                defaultValue={formatar(config.metaPct)}
                inputMode="decimal"
                required
              />
              <CampoTexto
                name="limite"
                label="Limite máximo aceitável (% do quadro médio)"
                defaultValue={formatar(config.limitePct)}
                inputMode="decimal"
                required
              />
            </FormularioAction>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Custo por desligamento</dt>
              <dd className="tabular-nums">
                {config.custoPorDesligamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </dd>
              <dt className="text-muted-foreground">Meta anual</dt>
              <dd className="tabular-nums">{formatar(config.metaPct)}% do quadro médio</dd>
              <dt className="text-muted-foreground">Limite máximo</dt>
              <dd className="tabular-nums">{formatar(config.limitePct)}% do quadro médio</dd>
              <dd className="col-span-2 text-xs text-muted-foreground">
                Só a diretoria com acesso ao grupo inteiro muda estes valores.
              </dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
