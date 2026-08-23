"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Fuel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarConsumo } from "@/lib/actions/processos-frota";
import { COMBUSTIVEIS, formatarPlaca } from "@/lib/processos/ctb";

export type ConsumoNaTela = {
  id: string;
  placa: string;
  dataTexto: string;
  tipo: string;
  combustivel: string | null;
  quantidade: number;
  valorTotal: number;
  hodometro: number | null;
  condutorNome: string | null;
  /** km/l (ou km/kWh) até o abastecimento ANTERIOR do mesmo veículo. */
  rendimento: number | null;
};

export type VeiculoParaConsumo = {
  id: string;
  placa: string;
  modelo: string | null;
  /** COMBUSTAO | ELETRICO | HIBRIDO — decide o rótulo litros × kWh. */
  motorizacao: string;
  condutorAtual: string | null;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function ConsumoView({
  empresaId,
  consumos,
  veiculos,
}: {
  empresaId: string;
  consumos: ConsumoNaTela[];
  veiculos: VeiculoParaConsumo[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }

  const veiculoEscolhido = veiculos.find((v) => v.id === form?.veiculoId);
  const eletrico = veiculoEscolhido?.motorizacao === "ELETRICO";

  function salvar() {
    if (!form) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarConsumo({
        empresaId,
        veiculoId: form.veiculoId ?? "",
        data: form.data ?? "",
        tipo: eletrico || form.combustivel === "ELETRICIDADE" ? "ENERGIA" : "COMBUSTIVEL",
        combustivel: form.combustivel || (eletrico ? "ELETRICIDADE" : null),
        quantidade: Number(form.quantidade) || 0,
        valorTotal: Number(form.valorTotal) || 0,
        hodometro: form.hodometro ? Number(form.hodometro) : null,
        posto: form.posto ?? null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setForm({})}>
          <Plus className="size-4" />
          Registrar abastecimento
        </Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {eletrico ? "Registrar recarga" : "Registrar abastecimento"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Veículo
              <select {...campo("veiculoId")} className={CAMPO}>
                <option value="">Escolha…</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatarPlaca(v.placa)}{v.modelo ? ` · ${v.modelo}` : ""}
                  </option>
                ))}
              </select>
              {veiculoEscolhido?.condutorAtual && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Será atribuído a {veiculoEscolhido.condutorAtual} (quem está com o carro).
                </span>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Data
              <input {...campo("data")} type="date" className={CAMPO} />
            </label>
            {!eletrico && (
              <label className="text-xs text-muted-foreground">
                Combustível
                <select {...campo("combustivel")} className={CAMPO}>
                  <option value="">Escolha…</option>
                  {COMBUSTIVEIS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-muted-foreground">
              {eletrico ? "kWh carregados" : "Litros"}
              <input {...campo("quantidade")} className={CAMPO} inputMode="decimal" />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor pago (R$)
              <input {...campo("valorTotal")} className={CAMPO} inputMode="decimal" />
            </label>
            <label className="text-xs text-muted-foreground">
              Hodômetro (km)
              <input {...campo("hodometro")} className={CAMPO} inputMode="numeric" />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                É ele que permite calcular o consumo entre um registro e o próximo.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Posto / local
              <input {...campo("posto")} className={CAMPO} />
            </label>
            <div className="flex items-end gap-2">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {consumos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Fuel className="mx-auto mb-2 size-5 opacity-50" />
            Nenhum abastecimento registrado. Registre com o hodômetro — é ele que transforma
            gasto em consumo por km.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Condutor</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">km</TableHead>
                  <TableHead className="text-right">Rendimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums">{c.dataTexto}</TableCell>
                    <TableCell className="font-medium tabular-nums">{formatarPlaca(c.placa)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.condutorNome ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
                      {c.tipo === "ENERGIA" ? "kWh" : "L"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.hodometro?.toLocaleString("pt-BR") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.rendimento !== null ? (
                        `${c.rendimento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/${c.tipo === "ENERGIA" ? "kWh" : "L"}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
