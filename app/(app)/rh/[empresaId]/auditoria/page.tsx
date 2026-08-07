import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarDataHoraBrasilia } from "@/lib/datas";

// Trilha de auditoria (LGPD): quem alterou ou baixou dado pessoal, quando e o
// quê. Append-only — esta tela é só leitura, não há como editar ou apagar.
const POR_PAGINA = 100;

const ROTULO_ACAO: Record<string, string> = {
  CRIAR: "Criou",
  ATUALIZAR: "Atualizou",
  EXCLUIR: "Excluiu",
  APROVAR: "Aprovou",
  REPROVAR: "Reprovou",
  CANCELAR: "Cancelou",
  BAIXAR_DOCUMENTO: "Baixou documento",
};

function varianteAcao(acao: string) {
  if (acao === "EXCLUIR" || acao === "REPROVAR") return "destructive" as const;
  if (acao === "APROVAR") return "default" as const;
  return "secondary" as const;
}

export default async function AuditoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { empresaId } = await params;
  const { pagina: paginaParam } = await searchParams;
  await requireEmpresaAccess(empresaId);

  const pagina = Math.max(1, Number.parseInt(paginaParam ?? "1", 10) || 1);

  const [registros, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.auditLog.count({ where: { empresaId } }),
  ]);

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trilha de auditoria</CardTitle>
        <CardDescription>
          Registro de quem criou, alterou, excluiu ou baixou dado pessoal nesta empresa — a prova
          exigida pela LGPD. Somente leitura. {total} registro(s).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {registros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum registro ainda — a trilha começa a partir das próximas alterações.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table compacta>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Quando</TableHead>
                  <TableHead className="w-40">Quem</TableHead>
                  <TableHead className="w-36">Ação</TableHead>
                  <TableHead>O quê</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatarDataHoraBrasilia(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      {r.usuarioNome ?? "—"}
                      {r.usuarioRole && (
                        <span className="block text-xs text-muted-foreground">{r.usuarioRole}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={varianteAcao(r.acao)}>{ROTULO_ACAO[r.acao] ?? r.acao}</Badge>
                    </TableCell>
                    <TableCell>{r.resumo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {ultimaPagina > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Página {pagina} de {ultimaPagina}
            </span>
            <div className="flex gap-3">
              {pagina > 1 && (
                <a href={`?pagina=${pagina - 1}`} className="hover:underline">
                  ← Anteriores
                </a>
              )}
              {pagina < ultimaPagina && (
                <a href={`?pagina=${pagina + 1}`} className="hover:underline">
                  Próximas →
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
