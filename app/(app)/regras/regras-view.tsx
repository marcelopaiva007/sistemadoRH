"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { createRegraBonificacao } from "@/lib/actions/regras";
import { CARGOS, type ActionResult } from "@/lib/constants";

type ProdutoValores = {
  internet?: number;
  chip?: number;
  gps?: number;
  streaming?: number;
  telefoniaFixa?: number;
};

type SupervisorTier = { meta?: number; valor?: number };
type RegraSupervisor = { tier3?: SupervisorTier; tier5?: SupervisorTier };

type Regra = {
  id: string;
  cargo: string;
  vigenciaInicio: Date;
  vigenciaFim: Date | null;
  metaQtd: number | null;
  valorMeta: number | null;
  superMetaQtd: number | null;
  valorSuperMeta: number | null;
  percentualTaxaAtivacao: number | null;
  valoresPorProduto: unknown;
  regraSupervisor: unknown;
  observacoes: string | null;
};

const initialState: ActionResult = { ok: true };
const fmtData = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const fmtMoeda = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RegrasView({ regras }: { regras: Regra[] }) {
  return (
    <Tabs defaultValue={CARGOS[0].value} className="space-y-4">
      <TabsList>
        {CARGOS.map((c) => (
          <TabsTrigger key={c.value} value={c.value}>
            {c.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CARGOS.map((c) => {
        const regrasDoCargo = regras.filter((r) => r.cargo === c.value);
        const atual = regrasDoCargo.find((r) => r.vigenciaFim === null) ?? null;
        const historico = regrasDoCargo.filter((r) => r.vigenciaFim !== null);
        return (
          <TabsContent key={c.value} value={c.value} className="space-y-4">
            <RegraAtualCard cargo={c.value} cargoLabel={c.label} atual={atual} />
            {historico.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Histórico de vigências</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vigência</TableHead>
                        <TableHead>Meta</TableHead>
                        <TableHead>Super Meta</TableHead>
                        <TableHead>Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            {fmtData(r.vigenciaInicio)} — {r.vigenciaFim ? fmtData(r.vigenciaFim) : ""}
                          </TableCell>
                          <TableCell>
                            {r.metaQtd ?? "—"} vendas / {fmtMoeda(r.valorMeta)}
                          </TableCell>
                          <TableCell>
                            {r.superMetaQtd ?? "—"} vendas / {fmtMoeda(r.valorSuperMeta)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.observacoes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function RegraAtualCard({
  cargo,
  cargoLabel,
  atual,
}: {
  cargo: string;
  cargoLabel: string;
  atual: Regra | null;
}) {
  const [open, setOpen] = useState(false);
  const produtos = (atual?.valoresPorProduto as ProdutoValores) ?? {};
  const supervisor = (atual?.regraSupervisor as RegraSupervisor) ?? {};

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Regra vigente — {cargoLabel}
          {atual && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              desde {fmtData(atual.vigenciaInicio)}
            </span>
          )}
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            <Plus className="size-4" />
            Nova vigência
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <RegraForm cargo={cargo} cargoLabel={cargoLabel} atual={atual} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!atual ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra cadastrada ainda para {cargoLabel.toLowerCase()}.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Meta</p>
              <p className="font-medium">
                {atual.metaQtd ?? "—"} vendas → {fmtMoeda(atual.valorMeta)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Super Meta</p>
              <p className="font-medium">
                {atual.superMetaQtd ?? "—"} vendas → {fmtMoeda(atual.valorSuperMeta)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de ativação (ex: chip)</p>
              <p className="font-medium">
                {atual.percentualTaxaAtivacao != null
                  ? `${(atual.percentualTaxaAtivacao * 100).toFixed(0)}% do valor vendido`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="font-medium">{atual.observacoes ?? "—"}</p>
            </div>

            <Separator className="col-span-full" />

            <div className="col-span-full">
              <p className="mb-2 text-xs text-muted-foreground">Valor por produto vendido</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Internet: {fmtMoeda(produtos.internet ?? 0)}</Badge>
                <Badge variant="secondary">Chip: {fmtMoeda(produtos.chip ?? 0)}</Badge>
                <Badge variant="secondary">GPS: {fmtMoeda(produtos.gps ?? 0)}</Badge>
                <Badge variant="secondary">Streaming: {fmtMoeda(produtos.streaming ?? 0)}</Badge>
                <Badge variant="secondary">Telefonia Fixa: {fmtMoeda(produtos.telefoniaFixa ?? 0)}</Badge>
              </div>
            </div>

            {cargo === "SUPERVISOR" && (
              <div className="col-span-full">
                <p className="mb-2 text-xs text-muted-foreground">Faixas de supervisor</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Equipe de 3: meta {supervisor.tier3?.meta ?? 0} vendas → {fmtMoeda(supervisor.tier3?.valor ?? 0)}
                  </Badge>
                  <Badge variant="outline">
                    Equipe de 5: meta {supervisor.tier5?.meta ?? 0} vendas → {fmtMoeda(supervisor.tier5?.valor ?? 0)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegraForm({
  cargo,
  cargoLabel,
  atual,
  onSuccess,
}: {
  cargo: string;
  cargoLabel: string;
  atual: Regra | null;
  onSuccess: () => void;
}) {
  const produtos = (atual?.valoresPorProduto as ProdutoValores) ?? {};
  const supervisor = (atual?.regraSupervisor as RegraSupervisor) ?? {};
  const hoje = new Date().toISOString().slice(0, 10);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await createRegraBonificacao(prev, fd);
    if (result.ok) {
      toast.success("Nova vigência criada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova vigência — {cargoLabel}</DialogTitle>
      </DialogHeader>
      <input type="hidden" name="cargo" value={cargo} />

      <div className="space-y-2">
        <Label htmlFor="vigenciaInicio">Válida a partir de</Label>
        <Input id="vigenciaInicio" name="vigenciaInicio" type="date" defaultValue={hoje} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="metaQtd">Meta (qtd. vendas)</Label>
          <Input id="metaQtd" name="metaQtd" type="number" defaultValue={atual?.metaQtd ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valorMeta">Valor da meta (R$)</Label>
          <Input id="valorMeta" name="valorMeta" type="number" step="0.01" defaultValue={atual?.valorMeta ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="superMetaQtd">Super meta (qtd. vendas)</Label>
          <Input id="superMetaQtd" name="superMetaQtd" type="number" defaultValue={atual?.superMetaQtd ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valorSuperMeta">Valor da super meta (R$)</Label>
          <Input
            id="valorSuperMeta"
            name="valorSuperMeta"
            type="number"
            step="0.01"
            defaultValue={atual?.valorSuperMeta ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="percentualTaxaAtivacao">Taxa de ativação (% do valor vendido, ex: chip = 50)</Label>
        <Input
          id="percentualTaxaAtivacao"
          name="percentualTaxaAtivacao"
          type="number"
          step="1"
          defaultValue={atual?.percentualTaxaAtivacao ? atual.percentualTaxaAtivacao * 100 : ""}
        />
      </div>

      <Separator />
      <p className="text-sm font-medium">Valor por produto vendido (R$)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="produto_internet">Internet</Label>
          <Input id="produto_internet" name="produto_internet" type="number" step="0.01" defaultValue={produtos.internet ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="produto_chip">Chip</Label>
          <Input id="produto_chip" name="produto_chip" type="number" step="0.01" defaultValue={produtos.chip ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="produto_gps">GPS</Label>
          <Input id="produto_gps" name="produto_gps" type="number" step="0.01" defaultValue={produtos.gps ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="produto_streaming">Streaming</Label>
          <Input id="produto_streaming" name="produto_streaming" type="number" step="0.01" defaultValue={produtos.streaming ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="produto_telefoniaFixa">Telefonia Fixa</Label>
          <Input
            id="produto_telefoniaFixa"
            name="produto_telefoniaFixa"
            type="number"
            step="0.01"
            defaultValue={produtos.telefoniaFixa ?? 0}
          />
        </div>
      </div>

      {cargo === "SUPERVISOR" && (
        <>
          <Separator />
          <p className="text-sm font-medium">Faixas de bonificação do supervisor</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="supervisor_tier3_meta">Equipe de 3 — meta (vendas)</Label>
              <Input
                id="supervisor_tier3_meta"
                name="supervisor_tier3_meta"
                type="number"
                defaultValue={supervisor.tier3?.meta ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisor_tier3_valor">Equipe de 3 — valor (R$)</Label>
              <Input
                id="supervisor_tier3_valor"
                name="supervisor_tier3_valor"
                type="number"
                step="0.01"
                defaultValue={supervisor.tier3?.valor ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisor_tier5_meta">Equipe de 5 — meta (vendas)</Label>
              <Input
                id="supervisor_tier5_meta"
                name="supervisor_tier5_meta"
                type="number"
                defaultValue={supervisor.tier5?.meta ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisor_tier5_valor">Equipe de 5 — valor (R$)</Label>
              <Input
                id="supervisor_tier5_valor"
                name="supervisor_tier5_valor"
                type="number"
                step="0.01"
                defaultValue={supervisor.tier5?.valor ?? 0}
              />
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações (opcional)</Label>
        <Textarea id="observacoes" name="observacoes" defaultValue={atual?.observacoes ?? ""} />
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar nova vigência"}
        </Button>
      </DialogFooter>
    </form>
  );
}
