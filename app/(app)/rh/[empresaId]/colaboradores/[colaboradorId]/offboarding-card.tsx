"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  gerarChecklistPadrao,
  dispensarChecklistDesligamento,
  reverterDispensaChecklist,
  adicionarItemChecklist,
  alternarItemChecklist,
  excluirItemChecklist,
  salvarEntrevistaDesligamento,
} from "@/lib/actions/rh-offboarding";
import { itemOffboardingLabel } from "@/lib/constants-offboarding";
import { motivoDesligamentoLabel } from "@/lib/constants-dp";
import { formatarData } from "@/lib/datas";
import { Campo, CampoData, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type ItemChecklist = {
  id: string;
  item: string;
  descricao: string | null;
  concluido: boolean;
  concluidoPorNome: string | null;
};

type Entrevista = {
  dataEntrevista: Date;
  motivoReal: string | null;
  recomendariaEmpresa: boolean | null;
  satisfacaoGeral: number | null;
  pontosPositivos: string | null;
  pontosMelhoria: string | null;
  observacoes: string | null;
} | null;

export function OffboardingCard({
  empresaId,
  colaboradorId,
  dataDesligamento,
  motivoDesligamento,
  checklistDispensado,
  checklistDispensadoEm,
  checklistDispensadoPorNome,
  checklist,
  entrevista,
}: {
  empresaId: string;
  colaboradorId: string;
  dataDesligamento: Date | null;
  motivoDesligamento: string | null;
  checklistDispensado: boolean;
  checklistDispensadoEm: Date | null;
  checklistDispensadoPorNome: string | null;
  checklist: ItemChecklist[];
  entrevista: Entrevista;
}) {
  const [gerando, setGerando] = useState(false);
  const [dispensando, setDispensando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  if (!dataDesligamento) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Desligamento</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Este colaborador está ativo. O checklist de saída e a entrevista de desligamento ficam
              disponíveis depois que a <strong>data de desligamento</strong> for preenchida na aba
              Ficha.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const concluidos = checklist.filter((i) => i.concluido).length;
  const tudoConcluido = checklist.length > 0 && concluidos === checklist.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Desligamento</CardTitle>
          <CardDescription>
            Desligado em {formatarData(dataDesligamento)}
            {motivoDesligamento && ` · ${motivoDesligamentoLabel(motivoDesligamento)}`}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-4" />
            Checklist de saída
            {checklist.length > 0 && (
              <Badge variant={tudoConcluido ? "default" : "secondary"}>
                {concluidos}/{checklist.length}
              </Badge>
            )}
          </CardTitle>
          <CardAction>
            <div className="flex gap-2">
              {checklist.length === 0 && !checklistDispensado && (
                <>
                  <Button
                    size="sm"
                    disabled={gerando}
                    onClick={async () => {
                      setGerando(true);
                      const r = await gerarChecklistPadrao(empresaId, colaboradorId);
                      setGerando(false);
                      if (r.ok) toast.success("Checklist gerado.");
                      else toast.error(r.error);
                    }}
                  >
                    {gerando ? "Gerando..." : "Gerar checklist padrão"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dispensando || !motivoDesligamento}
                    title={
                      !motivoDesligamento
                        ? "Preencha o motivo do desligamento na aba Ficha para poder dispensar."
                        : "Para desligamento antigo, sem como cobrar devolução de crachá/notebook/EPI de quem já saiu."
                    }
                    onClick={async () => {
                      setDispensando(true);
                      const r = await dispensarChecklistDesligamento(empresaId, colaboradorId);
                      setDispensando(false);
                      if (r.ok) toast.success("Checklist dispensado.");
                      else toast.error(r.error);
                    }}
                  >
                    {dispensando ? "Dispensando..." : "Dispensar (desligamento antigo)"}
                  </Button>
                </>
              )}
              <Dialog open={adicionando} onOpenChange={setAdicionando}>
                <DialogTrigger render={<Button size="sm" variant="outline" />}>
                  <Plus className="size-4" />
                  Item personalizado
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar item ao checklist</DialogTitle>
                  </DialogHeader>
                  <FormularioAction
                    action={adicionarItemChecklist.bind(null, empresaId, colaboradorId)}
                    textoBotao="Adicionar"
                    mensagemSucesso="Item adicionado."
                    onSuccess={() => setAdicionando(false)}
                  >
                    <CampoTexto name="descricao" label="Descrição do item" required autoFocus />
                  </FormularioAction>
                </DialogContent>
              </Dialog>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {checklistDispensado ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Checklist dispensado (desligamento antigo)
                {checklistDispensadoEm && ` em ${formatarData(checklistDispensadoEm)}`}
                {checklistDispensadoPorNome && ` por ${checklistDispensadoPorNome}`}.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={revertendo}
                onClick={async () => {
                  setRevertendo(true);
                  const r = await reverterDispensaChecklist(empresaId, colaboradorId);
                  setRevertendo(false);
                  if (r.ok) toast.success("Dispensa revertida.");
                  else toast.error(r.error);
                }}
              >
                {revertendo ? "Revertendo..." : "Reverter dispensa"}
              </Button>
            </div>
          ) : checklist.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum item no checklist ainda. Gere o checklist padrão para começar.
            </p>
          ) : (
            <ul className="divide-y">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <label className="flex flex-1 items-center gap-3">
                    <Checkbox
                      checked={item.concluido}
                      onCheckedChange={async () => {
                        const r = await alternarItemChecklist(empresaId, colaboradorId, item.id);
                        if (!r.ok) toast.error(r.error);
                      }}
                    />
                    <span className={item.concluido ? "text-muted-foreground line-through" : ""}>
                      {item.item === "OUTRO" ? item.descricao : itemOffboardingLabel(item.item)}
                    </span>
                    {item.concluido && item.concluidoPorNome && (
                      <span className="text-xs text-muted-foreground">por {item.concluidoPorNome}</span>
                    )}
                  </label>
                  <BotaoExcluir
                    onConfirm={async () => {
                      const r = await excluirItemChecklist(empresaId, colaboradorId, item.id);
                      if (r.ok) toast.success("Item removido.");
                      else toast.error(r.error);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          {tudoConcluido && (
            <div className="mt-3 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" />
              Checklist concluído.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entrevista de desligamento</CardTitle>
          <CardDescription>
            O motivo aqui pode diferir do motivo formal na ficha — é o espaço para o que a pessoa
            relatou de verdade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioAction
            action={salvarEntrevistaDesligamento.bind(null, empresaId, colaboradorId)}
            textoBotao={entrevista ? "Atualizar" : "Registrar entrevista"}
            mensagemSucesso="Entrevista registrada."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoData name="dataEntrevista" label="Data da entrevista" defaultValue={entrevista?.dataEntrevista} />
              <Campo label="Satisfação geral (1 a 5)">
                <input
                  type="number"
                  name="satisfacaoGeral"
                  min={1}
                  max={5}
                  defaultValue={entrevista?.satisfacaoGeral ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </Campo>
            </div>
            <Campo label="Motivo real relatado">
              <Textarea name="motivoReal" rows={2} defaultValue={entrevista?.motivoReal ?? ""} />
            </Campo>
            <Campo label="Recomendaria a empresa?">
              <select
                name="recomendariaEmpresa"
                defaultValue={
                  entrevista?.recomendariaEmpresa === true
                    ? "true"
                    : entrevista?.recomendariaEmpresa === false
                      ? "false"
                      : ""
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Não informado</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Pontos positivos">
                <Textarea name="pontosPositivos" rows={2} defaultValue={entrevista?.pontosPositivos ?? ""} />
              </Campo>
              <Campo label="Pontos de melhoria">
                <Textarea name="pontosMelhoria" rows={2} defaultValue={entrevista?.pontosMelhoria ?? ""} />
              </Campo>
            </div>
            <Campo label="Observações">
              <Textarea name="observacoes" rows={2} defaultValue={entrevista?.observacoes ?? ""} />
            </Campo>
          </FormularioAction>
        </CardContent>
      </Card>
    </div>
  );
}
