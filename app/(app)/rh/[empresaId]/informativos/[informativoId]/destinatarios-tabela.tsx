"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reenviarInformativo } from "@/lib/actions/rh-informativos";
import { formatarDataHoraBrasilia } from "@/lib/datas";

type Linha = {
  id: string;
  nome: string;
  setor: string;
  empresa: string;
  canal: string | null;
  envioErro: string | null;
  enviadoEm: Date | null;
  cienteEm: Date | null;
  cientePor: string | null;
};

const ROTULO_CANAL: Record<string, string> = { TELEGRAM: "Telegram", EMAIL: "E-mail" };

export function DestinatariosTabela({
  empresaId,
  informativoId,
  resumo,
  linhas,
}: {
  empresaId: string;
  informativoId: string;
  resumo: { total: number; cientes: number; semCanal: number };
  linhas: Linha[];
}) {
  const router = useRouter();
  const [reenviando, setReenviando] = useState(false);

  async function reenviar() {
    setReenviando(true);
    const r = await reenviarInformativo(empresaId, informativoId);
    setReenviando(false);
    if (r.ok && r.enviado) {
      toast.success(`Reenvio: ${r.enviado.avisados} avisada(s), ${r.enviado.semCanal} continuam sem canal.`);
      router.refresh();
    } else if (!r.ok) {
      toast.error(r.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quem recebeu</CardTitle>
        <CardDescription>
          {resumo.cientes} de {resumo.total} deram ciência.
          {resumo.semCanal > 0 &&
            ` ${resumo.semCanal} não foram avisadas por nenhum canal — veem o informativo quando abrirem o portal.`}
        </CardDescription>
        {resumo.semCanal > 0 && (
          <div>
            <Button type="button" size="sm" variant="outline" disabled={reenviando} onClick={reenviar}>
              <RefreshCw className="size-4" />
              {reenviando ? "Reenviando…" : "Tentar de novo quem ficou sem canal"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Ciência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="font-medium">{l.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.setor}
                    {l.setor ? " · " : ""}
                    {l.empresa}
                  </div>
                </TableCell>
                <TableCell>
                  {l.canal ? (
                    <Badge variant="secondary">{ROTULO_CANAL[l.canal] ?? l.canal}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground" title={l.envioErro ?? undefined}>
                      {l.enviadoEm ? "Só no portal" : "Não enviado"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {l.cienteEm ? (
                    <span className="text-sm">
                      {formatarDataHoraBrasilia(l.cienteEm)}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {l.cientePor === "TELEGRAM" ? "Telegram" : "portal"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Ainda não</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
