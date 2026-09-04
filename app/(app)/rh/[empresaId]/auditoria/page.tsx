import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatarDataHoraBrasilia } from "@/lib/datas";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { produtividadePorDia, resumoProdutividade } from "@/lib/produtividade-rh";
import { diasUteisNoIntervalo } from "@/lib/produtividade-rh-utils";
import { ProdutividadeView } from "./produtividade-view";

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

const JANELAS_VALIDAS = [7, 14, 30] as const;

export default async function AuditoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ pagina?: string; dias?: string }>;
}) {
  const { empresaId } = await params;
  const { pagina: paginaParam, dias: diasParam } = await searchParams;
  await requireEmpresaAccess(empresaId);

  const pagina = Math.max(1, Number.parseInt(paginaParam ?? "1", 10) || 1);
  const diasParseado = Number.parseInt(diasParam ?? "7", 10);
  const janelaDias = (JANELAS_VALIDAS as readonly number[]).includes(diasParseado)
    ? (diasParseado as 7 | 14 | 30)
    : 7;

  // Produtividade é por MARCA (RH_MANAGER costuma responder por mais de um
  // CNPJ da mesma marca); a trilha abaixo continua por CNPJ, de propósito —
  // são perguntas diferentes na mesma tela.
  const empresasDaMarca = await empresasDaMesmaMarca(empresaId);
  const agora = new Date();
  const inicioJanela = new Date(agora);
  inicioJanela.setDate(inicioJanela.getDate() - (janelaDias - 1));
  inicioJanela.setHours(0, 0, 0, 0);

  const [registros, total, detalheProdutividade, resumo] = await Promise.all([
    prisma.auditLog.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.auditLog.count({ where: { empresaId } }),
    produtividadePorDia(empresasDaMarca, inicioJanela, agora),
    resumoProdutividade(empresasDaMarca, inicioJanela, agora),
  ]);

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));
  const diasUteis = diasUteisNoIntervalo(inicioJanela, agora);

  return (
    // ?dias= só existe vindo de um clique dentro da aba Produtividade — usar
    // a presença dele para decidir a aba inicial evita voltar para Trilha
    // toda vez que a janela (7/14/30 dias) muda de recarregar a página.
    // `key` força remontagem: Tabs é não controlado, e mudar `defaultValue`
    // depois de montado (ex.: Fast Refresh reaproveitando a instância) dispara
    // aviso do Base UI — com `key` cada valor inicial é sempre um mount novo.
    <Tabs key={diasParam ? "produtividade" : "trilha"} defaultValue={diasParam ? "produtividade" : "trilha"}>
      <h1 className="mb-4">Auditoria</h1>
      <TabsList variant="line" className="mb-4">
        <TabsTrigger value="trilha">Trilha</TabsTrigger>
        <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
      </TabsList>

      <TabsContent value="trilha">
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
      </TabsContent>

      <TabsContent value="produtividade">
        <ProdutividadeView
          resumo={resumo}
          detalhe={detalheProdutividade}
          diasUteis={diasUteis}
          janelaDias={janelaDias}
        />
      </TabsContent>
    </Tabs>
  );
}
