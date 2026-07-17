"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { REGRAS_DEFAULT } from "@/lib/regras-defaults";
import type { RegraConfig, ServicoKey, ServicoRegra, SupervisorConfig } from "@/lib/bonificacao";

type Regra = {
  id: string;
  cargo: string;
  vigenciaInicio: Date;
  vigenciaFim: Date | null;
  config: unknown;
  observacoes: string | null;
};

const initialState: ActionResult = { ok: true };
const fmtData = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SERVICO_LABEL: Record<ServicoKey, string> = {
  internet: "Internet",
  chip: "Chip",
  gps: "GPS",
  tv: "TV",
  streaming: "Streaming",
  telefoniaFixa: "Telefonia Fixa",
  demaisServicos: "Demais serviços",
};

// Serviços editáveis por cargo e o mecanismo fixo de cada um (o tipo de regra
// segue a política da OS; a administração edita os valores, não o mecanismo).
const SERVICOS_POR_CARGO: Record<string, ServicoKey[]> = {
  VENDEDOR_EXTERNO: ["internet", "chip", "gps", "tv", "streaming", "telefoniaFixa"],
  SUPERVISOR: ["internet", "chip", "gps", "tv", "streaming", "telefoniaFixa"],
  ATENDIMENTO_ADM: ["internet", "demaisServicos"],
  OUTRO_SETOR: [],
};

function asConfig(cargo: string, raw: unknown): RegraConfig {
  if (raw && typeof raw === "object" && "servicos" in (raw as object)) {
    return raw as RegraConfig;
  }
  return REGRAS_DEFAULT[cargo] ?? { servicos: {} };
}

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
                        <TableHead>Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            {fmtData(r.vigenciaInicio)} — {r.vigenciaFim ? fmtData(r.vigenciaFim) : ""}
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

function descreverServico(regra: ServicoRegra): string {
  switch (regra.tipo) {
    case "faixas":
      return regra.faixas
        .map(
          (f) =>
            `${f.min}${f.max == null ? "+" : `–${f.max}`} → ${fmtMoeda(f.valor)}/venda`
        )
        .join(" · ");
    case "meta":
      return `meta ${regra.metaQtd} vendas → ${fmtMoeda(regra.valor)}/venda`;
    case "porVenda":
      return `${fmtMoeda(regra.valor)}/venda`;
    case "percentualValor":
      return `${(regra.percentual * 100).toFixed(0)}% do valor vendido`;
  }
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
  const config = atual ? asConfig(cargo, atual.config) : null;
  const servicos = SERVICOS_POR_CARGO[cargo] ?? [];

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
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <RegraForm cargo={cargo} cargoLabel={cargoLabel} atual={atual} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!config || servicos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {cargo === "OUTRO_SETOR"
              ? "Este cargo não recebe bonificação por vendas."
              : `Nenhuma regra cadastrada ainda para ${cargoLabel.toLowerCase()}.`}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {servicos.map((key) => {
                const regra = config.servicos?.[key];
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="w-32 justify-start">
                      {SERVICO_LABEL[key]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {regra ? descreverServico(regra) : "sem regra"}
                    </span>
                  </div>
                );
              })}
            </div>

            {cargo === "SUPERVISOR" && config.supervisor && (
              <>
                <Separator />
                <SupervisorResumo supervisor={config.supervisor} />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupervisorResumo({ supervisor }: { supervisor: SupervisorConfig }) {
  // Exemplo ilustrativo para uma equipe de 5 (transparência — OS §6).
  const tamanho = 5;
  const meta = supervisor.metaPorPessoa * tamanho;
  const largura = supervisor.larguraPorPessoa * tamanho;
  const faixas = supervisor.valoresFaixa
    .map((v, i) => {
      const inicio = meta + i * largura;
      const fim = i === supervisor.valoresFaixa.length - 1 ? null : inicio + largura - 1;
      return `${inicio}${fim == null ? "+" : `–${fim}`} → ${fmtMoeda(v)}/venda`;
    })
    .join(" · ");
  return (
    <div className="space-y-1 text-sm">
      <p className="text-xs text-muted-foreground">
        Bônus de supervisor (só internet da equipe) — meta = {supervisor.metaPorPessoa} × tamanho da equipe,
        largura da faixa = {supervisor.larguraPorPessoa} × tamanho.
      </p>
      <p className="text-muted-foreground">
        Ex. equipe de {tamanho}: meta {meta} vendas · {faixas}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de nova vigência
// ---------------------------------------------------------------------------

type FaixaRow = { min: string; max: string; valor: string };

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
  const inicial = useMemo(() => asConfig(cargo, atual?.config), [cargo, atual]);
  const hoje = new Date().toISOString().slice(0, 10);

  // --- estados por mecanismo ---
  const internetRegra = inicial.servicos?.internet;
  const [faixas, setFaixas] = useState<FaixaRow[]>(
    internetRegra?.tipo === "faixas"
      ? internetRegra.faixas.map((f) => ({
          min: String(f.min),
          max: f.max == null ? "" : String(f.max),
          valor: String(f.valor),
        }))
      : [{ min: "", max: "", valor: "" }]
  );

  const chipRegra = inicial.servicos?.chip;
  const [chipMetaQtd, setChipMetaQtd] = useState(
    chipRegra?.tipo === "meta" ? String(chipRegra.metaQtd) : ""
  );
  const [chipValor, setChipValor] = useState(
    chipRegra?.tipo === "meta" ? String(chipRegra.valor) : ""
  );

  const [porVenda, setPorVenda] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of ["gps", "tv", "streaming", "telefoniaFixa"] as const) {
      const r = inicial.servicos?.[key];
      init[key] = r?.tipo === "porVenda" ? String(r.valor) : "";
    }
    return init;
  });

  const admInternet = inicial.servicos?.internet;
  const [admInternetValor, setAdmInternetValor] = useState(
    admInternet?.tipo === "porVenda" ? String(admInternet.valor) : ""
  );
  const admDemais = inicial.servicos?.demaisServicos;
  const [admPercentual, setAdmPercentual] = useState(
    admDemais?.tipo === "percentualValor" ? String(admDemais.percentual * 100) : ""
  );

  const sup = inicial.supervisor;
  const [metaPorPessoa, setMetaPorPessoa] = useState(String(sup?.metaPorPessoa ?? 20));
  const [larguraPorPessoa, setLarguraPorPessoa] = useState(String(sup?.larguraPorPessoa ?? 10));
  const [valoresFaixa, setValoresFaixa] = useState<string[]>(
    (sup?.valoresFaixa ?? [2, 3, 4]).map(String)
  );

  const isVendedorLike = cargo === "VENDEDOR_EXTERNO" || cargo === "SUPERVISOR";
  const isAdm = cargo === "ATENDIMENTO_ADM";

  function buildConfig(): RegraConfig {
    const servicosConfig: RegraConfig["servicos"] = {};

    if (isVendedorLike) {
      servicosConfig.internet = {
        tipo: "faixas",
        faixas: faixas.map((f) => ({
          min: Number(f.min || 0),
          max: f.max.trim() === "" ? null : Number(f.max),
          valor: Number(f.valor || 0),
        })),
      };
      servicosConfig.chip = {
        tipo: "meta",
        metaQtd: Number(chipMetaQtd || 0),
        valor: Number(chipValor || 0),
      };
      for (const key of ["gps", "tv", "streaming", "telefoniaFixa"] as const) {
        servicosConfig[key] = { tipo: "porVenda", valor: Number(porVenda[key] || 0) };
      }
    }

    if (isAdm) {
      servicosConfig.internet = { tipo: "porVenda", valor: Number(admInternetValor || 0) };
      servicosConfig.demaisServicos = {
        tipo: "percentualValor",
        percentual: Number(admPercentual || 0) / 100,
      };
    }

    const config: RegraConfig = { servicos: servicosConfig };
    if (cargo === "SUPERVISOR") {
      config.supervisor = {
        metaPorPessoa: Number(metaPorPessoa || 0),
        larguraPorPessoa: Number(larguraPorPessoa || 0),
        valoresFaixa: valoresFaixa.map((v) => Number(v || 0)),
      };
    }
    return config;
  }

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("config", JSON.stringify(buildConfig()));
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

      {cargo === "OUTRO_SETOR" && (
        <Alert>
          <AlertDescription>
            Este cargo não recebe bonificação por vendas. A nova vigência será registrada sem regras.
          </AlertDescription>
        </Alert>
      )}

      {isVendedorLike && (
        <>
          <Separator />
          <p className="text-sm font-medium">Internet — faixas por volume (valor aplicado a todas as vendas)</p>
          <FaixasEditor faixas={faixas} onChange={setFaixas} />

          <Separator />
          <p className="text-sm font-medium">Chip — meta</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Meta (qtd. vendas)</Label>
              <Input type="number" value={chipMetaQtd} onChange={(e) => setChipMetaQtd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor por venda (R$)</Label>
              <Input type="number" step="0.01" value={chipValor} onChange={(e) => setChipValor(e.target.value)} />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium">Demais serviços — valor por venda (R$, desde a 1ª venda)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["gps", "tv", "streaming", "telefoniaFixa"] as const).map((key) => (
              <div key={key} className="space-y-2">
                <Label>{SERVICO_LABEL[key]}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={porVenda[key]}
                  onChange={(e) => setPorVenda((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {isAdm && (
        <>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Internet — valor por venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={admInternetValor}
                onChange={(e) => setAdmInternetValor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Demais serviços — % do valor vendido</Label>
              <Input
                type="number"
                step="1"
                value={admPercentual}
                onChange={(e) => setAdmPercentual(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {cargo === "SUPERVISOR" && (
        <>
          <Separator />
          <p className="text-sm font-medium">Bônus de supervisor (só internet da equipe)</p>
          <p className="text-xs text-muted-foreground">
            Meta = meta/pessoa × tamanho da equipe. Largura de cada faixa = largura/pessoa × tamanho. O tamanho da
            equipe é contado automaticamente (membros ativos + o supervisor).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Meta por pessoa</Label>
              <Input type="number" value={metaPorPessoa} onChange={(e) => setMetaPorPessoa(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Largura da faixa por pessoa</Label>
              <Input
                type="number"
                value={larguraPorPessoa}
                onChange={(e) => setLarguraPorPessoa(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor por venda de cada faixa (R$) — da 1ª à última</Label>
            <div className="flex flex-wrap gap-2">
              {valoresFaixa.map((v, i) => (
                <Input
                  key={i}
                  type="number"
                  step="0.01"
                  className="w-24"
                  value={v}
                  onChange={(e) =>
                    setValoresFaixa((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValoresFaixa((arr) => [...arr, ""])}
              >
                <Plus className="size-4" />
              </Button>
              {valoresFaixa.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValoresFaixa((arr) => arr.slice(0, -1))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <Alert>
            <AlertDescription className="text-xs">
              ⚠️ A fórmula de faixas do supervisor foi generalizada a partir do exemplo da OS (equipe de 5).
              Confirme os valores para equipes de tamanho diferente de 5 antes de usar em produção.
            </AlertDescription>
          </Alert>
        </>
      )}

      <Separator />
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

function FaixasEditor({
  faixas,
  onChange,
}: {
  faixas: FaixaRow[];
  onChange: (f: FaixaRow[]) => void;
}) {
  function update(i: number, campo: keyof FaixaRow, valor: string) {
    onChange(faixas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
        <span>Mín. vendas</span>
        <span>Máx. vendas (vazio = ∞)</span>
        <span>Valor/venda (R$)</span>
        <span />
      </div>
      {faixas.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
          <Input type="number" value={f.min} onChange={(e) => update(i, "min", e.target.value)} />
          <Input type="number" value={f.max} onChange={(e) => update(i, "max", e.target.value)} placeholder="∞" />
          <Input type="number" step="0.01" value={f.valor} onChange={(e) => update(i, "valor", e.target.value)} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={faixas.length <= 1}
            onClick={() => onChange(faixas.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...faixas, { min: "", max: "", valor: "" }])}
      >
        <Plus className="size-4" />
        Adicionar faixa
      </Button>
    </div>
  );
}
