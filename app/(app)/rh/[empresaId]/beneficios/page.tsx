import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TIPOS_BENEFICIO, formatarReais, tipoBeneficioLabel } from "@/lib/constants-beneficios";
import { hojeUTC } from "@/lib/datas";

// Visão geral de benefícios: quanto a empresa gasta por tipo e quantas pessoas
// têm cada um. Só benefícios VIGENTES entram na conta (dataFim null ou no
// futuro) — o que já foi encerrado não pesa no custo mensal atual.
export default async function BeneficiosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();

  const vigentes = await prisma.beneficioColaborador.findMany({
    where: { empresaId, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
    select: {
      tipo: true,
      valorEmpresa: true,
      valorColaborador: true,
      colaboradorId: true,
      colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
    },
  });

  const porTipo = new Map<string, { colaboradores: number; custoEmpresa: number; custoColaborador: number }>();
  for (const b of vigentes) {
    const atual = porTipo.get(b.tipo) ?? { colaboradores: 0, custoEmpresa: 0, custoColaborador: 0 };
    atual.colaboradores += 1;
    atual.custoEmpresa += b.valorEmpresa ?? 0;
    atual.custoColaborador += b.valorColaborador ?? 0;
    porTipo.set(b.tipo, atual);
  }

  const linhas = TIPOS_BENEFICIO.map((t) => ({ tipo: t.value, label: t.label, ...(porTipo.get(t.value) ?? { colaboradores: 0, custoEmpresa: 0, custoColaborador: 0 }) })).filter(
    (l) => l.colaboradores > 0,
  );
  const custoTotalEmpresa = linhas.reduce((total, l) => total + l.custoEmpresa, 0);
  const totalColaboradoresAtivos = await prisma.colaborador.count({ where: { empresaId, ativo: true } });

  return (
    <div className="space-y-6">
      <div>
        <h1>Benefícios</h1>
        <p className="text-sm text-muted-foreground">
          Panorama do que a empresa paga hoje. Só benefícios em vigor entram na conta.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="text-xs text-muted-foreground">Custo mensal da empresa</div>
          <div className="text-2xl font-semibold tabular-nums">{formatarReais(custoTotalEmpresa)}</div>
        </div>
        <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="text-xs text-muted-foreground">Tipos de benefício concedidos</div>
          <div className="text-2xl font-semibold tabular-nums">{linhas.length}</div>
        </div>
        <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="text-xs text-muted-foreground">Colaboradores ativos</div>
          <div className="text-2xl font-semibold tabular-nums">{totalColaboradoresAtivos}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por tipo</CardTitle>
          <CardDescription>Quantas pessoas têm cada benefício e quanto custa por mês.</CardDescription>
        </CardHeader>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum benefício concedido ainda. Conceda pela ficha do colaborador, aba Benefícios.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benefício</TableHead>
                    <TableHead className="text-right">Colaboradores</TableHead>
                    <TableHead className="text-right">Custo empresa/mês</TableHead>
                    <TableHead className="text-right">Desconto folha/mês</TableHead>
                    <TableHead>Cobertura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.tipo}>
                      <TableCell className="font-medium">{tipoBeneficioLabel(l.tipo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.colaboradores}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarReais(l.custoEmpresa)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarReais(l.custoColaborador)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {totalColaboradoresAtivos > 0 ? Math.round((l.colaboradores / totalColaboradoresAtivos) * 100) : 0}% da equipe
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
