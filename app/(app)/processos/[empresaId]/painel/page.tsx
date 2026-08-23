import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Car, FileWarning, IdCard, Wrench } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import { GraficoCustoMensal, GraficoTopVeiculos, type MesDeCusto, type TopVeiculo } from "./painel-view";

// Painel do módulo Processos & Ativos — a leitura de DIRETORIA.
//
// A divisão de trabalho com as outras telas é deliberada: a CENTRAL é a fila
// de quem executa (cada linha tem dono e botão); a ANÁLISE é a tabela completa
// de quem investiga; o PAINEL é o resumo de quem decide — meia dúzia de
// números e dois gráficos, com link para onde agir. Nada aqui tem botão de
// ação, e é de propósito: decisão desce para a Central, não se resolve num
// gráfico.
//
// Todos os números saem dos registros na hora (nenhuma coluna de agregado
// persistida) e a janela é 12 meses.
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function PainelProcessosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const hoje = hojeUTC();
  const inicioJanela = new Date(Date.UTC(hoje.getUTCFullYear() - 1, hoje.getUTCMonth(), 1));
  const em60dias = somarDiasUTC(hoje, 60);

  const [
    empresa,
    pendencias,
    totalVeiculos,
    multasAIndicar,
    cnhVencendo,
    consumos,
    manutencoes,
    infracoes,
    veiculos,
  ] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.pendencia.findMany({
      where: { empresaId: { in: escopo }, estado: { in: ["ABERTA", "EM_ANDAMENTO"] } },
      select: { venceEm: true, responsavelId: true },
    }),
    prisma.veiculo.count({ where: { empresaId: { in: escopo }, situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } } }),
    prisma.infracao.count({
      where: { empresaId: { in: escopo }, statusIndicacao: "PENDENTE", prazoIndicacaoCondutor: { not: null } },
    }),
    prisma.condutor.count({
      where: {
        empresaId: { in: escopo },
        colaborador: { ativo: true },
        cnhValidade: { not: null, lte: em60dias },
      },
    }),
    prisma.consumoVeiculo.findMany({
      where: { empresaId: { in: escopo }, data: { gte: inicioJanela } },
      select: { data: true, valorTotal: true, veiculoId: true },
    }),
    prisma.manutencaoVeiculo.findMany({
      where: { empresaId: { in: escopo }, data: { gte: inicioJanela } },
      select: { data: true, valor: true, veiculoId: true },
    }),
    prisma.infracao.findMany({
      where: { empresaId: { in: escopo }, dataHoraInfracao: { gte: inicioJanela } },
      select: { dataHoraInfracao: true, valorOriginal: true, veiculoId: true },
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo } },
      select: { id: true, placa: true },
    }),
  ]);
  if (!empresa) notFound();

  // Pendências por urgência — os mesmos cortes da Central, para os números
  // daqui baterem com os de lá (painel que discorda da fila mata os dois).
  let vencidas = 0;
  let seteDias = 0;
  let semDono = 0;
  for (const p of pendencias) {
    const dias = Math.round((p.venceEm.getTime() - hoje.getTime()) / 86_400_000);
    if (!p.responsavelId) semDono++;
    else if (dias < 0) vencidas++;
    else if (dias <= 7) seteDias++;
  }

  // Série mensal: chave AAAA-MM em UTC (as datas do módulo são de calendário).
  const meses: MesDeCusto[] = [];
  const indice = new Map<string, MesDeCusto>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    const chave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const linha = { mes: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, combustivel: 0, manutencao: 0, multas: 0 };
    indice.set(chave, linha);
    meses.push(linha);
  }
  const chaveDe = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const custoPorVeiculo = new Map<string, number>();
  const soma = (veiculoId: string, v: number) =>
    custoPorVeiculo.set(veiculoId, (custoPorVeiculo.get(veiculoId) ?? 0) + v);

  for (const c of consumos) {
    indice.get(chaveDe(c.data)) && (indice.get(chaveDe(c.data))!.combustivel += c.valorTotal);
    soma(c.veiculoId, c.valorTotal);
  }
  for (const m of manutencoes) {
    if (m.valor) {
      indice.get(chaveDe(m.data)) && (indice.get(chaveDe(m.data))!.manutencao += m.valor);
      soma(m.veiculoId, m.valor);
    }
  }
  for (const i of infracoes) {
    if (i.valorOriginal) {
      indice.get(chaveDe(i.dataHoraInfracao)) && (indice.get(chaveDe(i.dataHoraInfracao))!.multas += i.valorOriginal);
      soma(i.veiculoId, i.valorOriginal);
    }
  }

  const placaDe = new Map(veiculos.map((v) => [v.id, v.placa]));
  const top: TopVeiculo[] = [...custoPorVeiculo.entries()]
    .map(([id, total]) => ({ placa: placaDe.get(id) ?? "—", total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const custo12m = [...custoPorVeiculo.values()].reduce((a, v) => a + v, 0);
  const temSerie = meses.some((m) => m.combustivel + m.manutencao + m.multas > 0);
  const base = `/processos/${empresaId}`;

  const atalhos = [
    { href: base, icone: AlertTriangle, rotulo: "Central de Pendências" },
    { href: `${base}/frota/multas`, icone: FileWarning, rotulo: "Multas" },
    { href: `${base}/frota/analise`, icone: Car, rotulo: "Análise da frota" },
    { href: `${base}/frota/condutores`, icone: IdCard, rotulo: "Condutores" },
    { href: `${base}/frota/manutencoes`, icone: Wrench, rotulo: "Manutenções" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Painel</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O resumo de quem decide: prazos em risco e o custo da frota, nos últimos 12 meses.
          Para agir, desça à Central — aqui nada tem botão, de propósito.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador icone={<span className="text-destructive">●</span>} rotulo="Pendências vencidas" valor={vencidas} />
        <Indicador rotulo="Vencem em 7 dias" valor={seteDias} />
        <Indicador rotulo="Sem responsável" valor={semDono} />
        <Indicador rotulo="Multas a indicar" valor={multasAIndicar} />
        <Indicador rotulo="CNHs vencendo (60d)" valor={cnhVencendo} />
        <Indicador rotulo="Veículos ativos" valor={totalVeiculos} />
      </div>

      {temSerie ? (
        <>
          <GraficoCustoMensal dados={meses} />
          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoTopVeiculos dados={top} />
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Custo total em 12 meses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-3xl font-semibold tabular-nums">
                  {custo12m.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Soma de combustível/energia, manutenção e multas registrados. O número é tão
                  completo quanto o registro — despesa não lançada não aparece aqui.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Os gráficos de custo nascem quando os primeiros consumos, manutenções e multas forem
            registrados. Os indicadores acima já valem.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {atalhos.map((a) => {
          const Icone = a.icone;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Icone className="size-4 text-muted-foreground" />
              {a.rotulo}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
