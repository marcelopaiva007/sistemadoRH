import Link from "next/link";
import { HardHat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ExposicaoDaEmpresa } from "@/lib/conformidade-grupo";

/**
 * "Quantos técnicos estão sem certificação válida?" — hoje a resposta era
 * "abra as 8 telas e some". A tela de Conformidade de cada CNPJ continua
 * exatamente como estava (é lá que se cadastra requisito e certificado);
 * este bloco só soma o que já existe, um CNPJ por linha.
 *
 * Sem coluna de percentual quando ninguém tem requisito cadastrado: "0 de 0"
 * não é 0% nem 100%, é "sem base para avaliar" — mesma regra da tela de
 * Pendências para módulo nunca usado.
 */
export function ExposicaoSstView({
  empresaIdAtual,
  exposicao,
}: {
  empresaIdAtual: string;
  exposicao: ExposicaoDaEmpresa[];
}) {
  const semRequisitoEmLugarNenhum = exposicao.every((e) => e.comRequisitoNR === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardHat className="size-4" />
          Exposição SST por CNPJ
        </CardTitle>
        <CardDescription>
          Quem está sem NR válida ou sem ASO em dia, empresa por empresa. A matriz de exigência e o
          cadastro de certificado continuam na tela de cada CNPJ — clique na linha para abrir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {semRequisitoEmLugarNenhum && (
          <p className="mb-3 text-sm text-muted-foreground">
            Nenhum CNPJ do grupo tem NR cadastrada por função ainda — a coluna de NR fica sem base
            para avaliar até a matriz de exigência ser preenchida em pelo menos uma empresa.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Ativos</TableHead>
              <TableHead className="text-right">Com NR exigida</TableHead>
              <TableHead className="text-right">Regular em NR</TableHead>
              <TableHead className="text-right">ASO em dia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exposicao.map((e) => (
              <TableRow key={e.empresaId} className={e.empresaId === empresaIdAtual ? "bg-accent/40" : undefined}>
                <TableCell>
                  <Link href={`/rh/${e.empresaId}/conformidade`} className="font-medium hover:underline">
                    {e.empresaNome}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.ativos}</TableCell>
                <TableCell className="text-right tabular-nums">{e.comRequisitoNR}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.comRequisitoNR === 0 ? (
                    <span className="text-muted-foreground">sem base</span>
                  ) : (
                    <Badge variant={e.regularesNR < e.comRequisitoNR ? "destructive" : "default"}>
                      {e.regularesNR}/{e.comRequisitoNR}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.ativos === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge variant={e.examesEmDia < e.ativos ? "destructive" : "default"}>
                      {e.examesEmDia}/{e.ativos}
                    </Badge>
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
