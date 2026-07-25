"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  gerarTrilhaPadrao,
  adicionarItemIntegracao,
  alternarItemIntegracao,
  excluirItemIntegracao,
} from "@/lib/actions/rh-onboarding";
import { itemOnboardingLabel } from "@/lib/constants-onboarding";
import { formatarData, diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { CampoData, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type ItemIntegracao = {
  id: string;
  item: string;
  descricao: string | null;
  responsavel: string | null;
  prazo: Date | null;
  concluido: boolean;
  concluidoPorNome: string | null;
};

export function IntegracaoCard({
  empresaId,
  colaboradorId,
  itens,
}: {
  empresaId: string;
  colaboradorId: string;
  itens: ItemIntegracao[];
}) {
  const [gerando, setGerando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const concluidos = itens.filter((i) => i.concluido).length;
  const tudoConcluido = itens.length > 0 && concluidos === itens.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-4" />
          Trilha de integração
          {itens.length > 0 && (
            <Badge variant={tudoConcluido ? "default" : "secondary"}>
              {concluidos}/{itens.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          O que precisa acontecer para a pessoa começar de fato — entrega de equipamento, acesso e
          integração. Cada item tem um responsável, porque a integração é distribuída entre áreas.
        </CardDescription>
        <CardAction>
          <div className="flex gap-2">
            {itens.length === 0 && (
              <Button
                size="sm"
                disabled={gerando}
                onClick={async () => {
                  setGerando(true);
                  const r = await gerarTrilhaPadrao(empresaId, colaboradorId);
                  setGerando(false);
                  if (r.ok) toast.success("Trilha gerada.");
                  else toast.error(r.error);
                }}
              >
                {gerando ? "Gerando..." : "Gerar trilha padrão"}
              </Button>
            )}
            <Dialog open={adicionando} onOpenChange={setAdicionando}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="size-4" />
                Item personalizado
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar item à trilha</DialogTitle>
                </DialogHeader>
                <FormularioAction
                  action={adicionarItemIntegracao.bind(null, empresaId, colaboradorId)}
                  textoBotao="Adicionar"
                  mensagemSucesso="Item adicionado."
                  onSuccess={() => setAdicionando(false)}
                >
                  <CampoTexto name="descricao" label="Descrição do item" required autoFocus />
                  <CampoTexto name="responsavel" label="Responsável" placeholder="Ex.: TI, Almoxarifado" />
                  <CampoData name="prazo" label="Prazo (opcional)" />
                </FormularioAction>
              </DialogContent>
            </Dialog>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum item na trilha ainda. Gere a trilha padrão para começar.
          </p>
        ) : (
          <ul className="divide-y">
            {itens.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <label className="flex flex-1 items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={item.concluido}
                    onCheckedChange={async () => {
                      const r = await alternarItemIntegracao(empresaId, colaboradorId, item.id);
                      if (!r.ok) toast.error(r.error);
                    }}
                  />
                  <div className={item.concluido ? "text-muted-foreground line-through" : ""}>
                    <div>{item.item === "OUTRO" ? item.descricao : itemOnboardingLabel(item.item)}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {item.responsavel && <span>{item.responsavel}</span>}
                      {item.prazo && <SituacaoPrazo prazo={item.prazo} concluido={item.concluido} />}
                      {item.concluido && item.concluidoPorNome && <span>por {item.concluidoPorNome}</span>}
                    </div>
                  </div>
                </label>
                <BotaoExcluir
                  onConfirm={async () => {
                    const r = await excluirItemIntegracao(empresaId, colaboradorId, item.id);
                    if (r.ok) toast.success("Item removido.");
                    else toast.error(r.error);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {tudoConcluido && (
          <div className="mt-3 flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="size-4" />
            Integração concluída.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SituacaoPrazo({ prazo, concluido }: { prazo: Date; concluido: boolean }) {
  if (concluido) return <span>prazo era {formatarData(prazo)}</span>;
  const dias = diferencaEmDiasUTC(prazo, hojeUTC());
  if (dias < 0) return <span className="text-destructive">atrasado há {Math.abs(dias)} d</span>;
  if (dias === 0) return <span className="text-amber-600 dark:text-amber-400">vence hoje</span>;
  return <span>vence em {dias} d</span>;
}
