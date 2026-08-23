"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { registrarManutencao } from "@/lib/actions/processos-frota";
import { TIPOS_MANUTENCAO, formatarPlaca, rotulo } from "@/lib/processos/ctb";

export type ManutencaoNaTela = {
  id: string;
  placa: string;
  dataTexto: string;
  tipo: string;
  descricao: string;
  valor: number | null;
  fornecedor: string | null;
  proximaRevisaoTexto: string | null;
  proximaRevisaoKm: number | null;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function ManutencoesView({
  empresaId,
  manutencoes,
  veiculos,
}: {
  empresaId: string;
  manutencoes: ManutencaoNaTela[];
  veiculos: { id: string; placa: string; modelo: string | null }[];
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

  function salvar() {
    if (!form) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarManutencao({
        empresaId,
        veiculoId: form.veiculoId ?? "",
        tipo: form.tipo ?? "OUTRA",
        descricao: form.descricao ?? "",
        data: form.data ?? "",
        valor: form.valor ? Number(form.valor) : null,
        hodometro: form.hodometro ? Number(form.hodometro) : null,
        fornecedor: form.fornecedor ?? null,
        proximaRevisaoData: form.proximaRevisaoData ?? null,
        proximaRevisaoKm: form.proximaRevisaoKm ? Number(form.proximaRevisaoKm) : null,
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
        <Button size="sm" className="gap-2" onClick={() => setForm({ tipo: "PREVENTIVA" })}>
          <Plus className="size-4" />
          Registrar manutenção
        </Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Registrar manutenção</CardTitle></CardHeader>
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
            </label>
            <label className="text-xs text-muted-foreground">
              Tipo
              <select {...campo("tipo")} className={CAMPO}>
                {TIPOS_MANUTENCAO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Data
              <input {...campo("data")} type="date" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor (R$)
              <input {...campo("valor")} className={CAMPO} inputMode="decimal" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              O que foi feito
              <input {...campo("descricao")} className={CAMPO} placeholder="Ex.: troca de óleo e filtros" />
            </label>
            <label className="text-xs text-muted-foreground">
              Fornecedor / oficina
              <input {...campo("fornecedor")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Hodômetro (km)
              <input {...campo("hodometro")} className={CAMPO} inputMode="numeric" />
            </label>
            <label className="text-xs text-muted-foreground">
              Próxima revisão — data
              <input {...campo("proximaRevisaoData")} type="date" className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Preenchida, vira aviso na Central de Pendências.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Próxima revisão — km
              <input {...campo("proximaRevisaoKm")} className={CAMPO} inputMode="numeric" />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {manutencoes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Wrench className="mx-auto mb-2 size-5 opacity-50" />
            Nenhuma manutenção registrada.
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>O que foi feito</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Próxima revisão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manutencoes.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums">{m.dataTexto}</TableCell>
                    <TableCell className="font-medium tabular-nums">{formatarPlaca(m.placa)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.tipo === "CORRETIVA" || m.tipo === "SINISTRO" ? "destructive" : "secondary"}
                        className="font-normal"
                      >
                        {rotulo(TIPOS_MANUTENCAO, m.tipo)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground" title={m.descricao}>
                      {m.descricao}
                      {m.fornecedor && <span className="text-muted-foreground/70"> · {m.fornecedor}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.valor !== null
                        ? m.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.proximaRevisaoTexto ?? "—"}
                      {m.proximaRevisaoKm !== null && (
                        <span className="text-muted-foreground/70">
                          {m.proximaRevisaoTexto ? " ou " : ""}
                          {m.proximaRevisaoKm.toLocaleString("pt-BR")} km
                        </span>
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
