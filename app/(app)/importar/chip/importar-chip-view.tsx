"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  previsualizarChipMovel,
  sincronizarChipMovelAgora,
  type LinhaChipMovel,
} from "@/lib/actions/chip-movel";

export function ImportarChipView({ periodoInicial }: { periodoInicial: string }) {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaChipMovel[] | null>(null);
  const [totalVendas, setTotalVendas] = useState(0);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await previsualizarChipMovel(periodo);
      setLinhas(r.linhas);
      setTotalVendas(r.totalVendas);
      setUltimaSync(r.ultimaSync ? new Date(r.ultimaSync) : null);
    } catch {
      toast.error("Erro ao carregar as vendas de chip.");
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      const r = await sincronizarChipMovelAgora(periodo);
      if (!r.ok) {
        toast.error(r.error);
      } else {
        const ap = r.resultado.aplicacao;
        toast.success(
          `${r.resultado.vendasSalvas} venda(s) sincronizadas; ` +
            (ap?.aplicado
              ? `${ap.lancamentosGravados} lançamento(s) gravados.`
              : ap?.motivo || "lançamentos não alterados."),
        );
        await carregar();
      }
    } finally {
      setSincronizando(false);
    }
  }

  const naoMapeados = (linhas ?? []).filter((l) => !l.funcionarioId);
  const totalAprovado = (linhas ?? []).reduce((acc, l) => acc + l.aprovado, 0);
  const totalCancelado = (linhas ?? []).reduce((acc, l) => acc + l.cancelado, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="periodo-chip">Mês de referência</Label>
            <Input
              id="periodo-chip"
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={sincronizarAgora} disabled={sincronizando || carregando}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${sincronizando ? "animate-spin" : ""}`}
            />
            {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {totalVendas} venda(s) no snapshot
            {ultimaSync
              ? ` — última sincronização em ${ultimaSync.toLocaleString("pt-BR")}`
              : " — ainda não sincronizado"}
          </p>
        </CardContent>
      </Card>

      {naoMapeados.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {naoMapeados.length} vendedor(es) do sistema móvel não foram
            encontrados no cadastro de funcionários e estão fora da bonificação:{" "}
            {naoMapeados.map((l) => l.sellerNome).join(", ")}. Cadastre o
            funcionário (com o mesmo nome ou CPF) e sincronize novamente.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Vendas por vendedor — {totalAprovado} aprovada(s), {totalCancelado}{" "}
            cancelada(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !linhas || linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda de chip sincronizada para este período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor (sistema móvel)</TableHead>
                  <TableHead>Funcionário mapeado</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Aprovadas</TableHead>
                  <TableHead className="text-right">Canceladas</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.sellerNome}>
                    <TableCell className="font-medium">{l.sellerNome}</TableCell>
                    <TableCell>
                      {l.funcionarioNome ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{l.quantidade}</TableCell>
                    <TableCell className="text-right">{l.aprovado}</TableCell>
                    <TableCell className="text-right">{l.cancelado}</TableCell>
                    <TableCell>
                      {l.funcionarioId ? (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Mapeado
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Não mapeado
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
