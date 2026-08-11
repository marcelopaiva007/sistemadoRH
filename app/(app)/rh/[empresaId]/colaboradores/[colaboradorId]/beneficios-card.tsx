"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { concederBeneficio, encerrarBeneficio, excluirBeneficio } from "@/lib/actions/rh-beneficios";
import { TIPOS_BENEFICIO, formatarReais, tipoBeneficioLabel } from "@/lib/constants-beneficios";
import { formatarData } from "@/lib/datas";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { BotaoExcluir } from "./dependentes-card";

type Beneficio = {
  id: string;
  tipo: string;
  operadora: string | null;
  plano: string | null;
  valorEmpresa: number | null;
  valorColaborador: number | null;
  dataInicio: Date;
  dataFim: Date | null;
  observacoes: string | null;
};

export function BeneficiosCard({
  empresaId,
  colaboradorId,
  beneficios,
  tiposBeneficioCustom,
  temDependentesNoPlano,
}: {
  empresaId: string;
  colaboradorId: string;
  beneficios: Beneficio[];
  /** Catálogo aditivo por empresa (lib/actions/rh-tipos-beneficio.ts) — soma ao fixo, não substitui. */
  tiposBeneficioCustom: string[];
  temDependentesNoPlano: number;
}) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();

  const ativos = beneficios.filter((b) => !b.dataFim || b.dataFim >= hoje);
  const encerrados = beneficios.filter((b) => b.dataFim && b.dataFim < hoje);
  const custoMensalEmpresa = ativos.reduce((total, b) => total + (b.valorEmpresa ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benefícios</CardTitle>
        <CardDescription>
          VT, VR/VA, plano de saúde e demais benefícios concedidos.
          {temDependentesNoPlano > 0 && (
            <span className="mt-1 block">
              {temDependentesNoPlano} dependente(s) marcados para plano de saúde na aba Dependentes.
            </span>
          )}
        </CardDescription>
        <CardAction>
          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="size-4" />
              Conceder benefício
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Conceder benefício</DialogTitle>
              </DialogHeader>
              <FormularioAction
                action={concederBeneficio.bind(null, empresaId, colaboradorId)}
                textoBotao="Conceder"
                mensagemSucesso="Benefício concedido."
                onSuccess={() => setAberto(false)}
              >
                <CampoSelect
                  name="tipo"
                  label="Tipo"
                  opcoes={[
                    ...TIPOS_BENEFICIO.map((t) => ({ value: t.value, label: t.label })),
                    ...tiposBeneficioCustom.map((nome) => ({ value: nome, label: nome })),
                  ]}
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="operadora" label="Operadora / fornecedor" placeholder="Ex: Unimed, VB" />
                  <CampoTexto name="plano" label="Plano / categoria" placeholder="Ex: Enfermaria" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoTexto name="valorEmpresa" label="Custo p/ empresa (R$/mês)" placeholder="Ex: 350,00" />
                  <CampoTexto name="valorColaborador" label="Desconto em folha (R$/mês)" placeholder="Ex: 50,00" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoData name="dataInicio" label="Início" />
                  <CampoData name="dataFim" label="Fim (se já souber)" />
                </div>
                <Campo label="Observações">
                  <Textarea name="observacoes" rows={2} />
                </Campo>
              </FormularioAction>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {ativos.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Custo mensal para a empresa:{" "}
            <span className="font-medium text-foreground tabular-nums">{formatarReais(custoMensalEmpresa)}</span>
          </p>
        )}
        {beneficios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum benefício concedido ainda.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Operadora / plano</TableHead>
                  <TableHead>Custo empresa</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...ativos, ...encerrados].map((b) => {
                  const encerrado = b.dataFim && b.dataFim < hoje;
                  return (
                    <TableRow key={b.id} className={encerrado ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{tipoBeneficioLabel(b.tipo)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {[b.operadora, b.plano].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatarReais(b.valorEmpresa)}</TableCell>
                      <TableCell className="tabular-nums">{formatarReais(b.valorColaborador)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatarData(b.dataInicio)} — {b.dataFim ? formatarData(b.dataFim) : "atual"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!b.dataFim && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const r = await encerrarBeneficio(empresaId, colaboradorId, b.id);
                                if (r.ok) toast.success("Benefício encerrado.");
                                else toast.error(r.error);
                              }}
                            >
                              Encerrar
                            </Button>
                          )}
                          <BotaoExcluir
                            onConfirm={async () => {
                              const r = await excluirBeneficio(empresaId, colaboradorId, b.id);
                              if (r.ok) toast.success("Benefício excluído.");
                              else toast.error(r.error);
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
