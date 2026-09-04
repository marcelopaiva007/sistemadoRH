import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { hojeUTC } from "@/lib/datas";
import { formatarPlaca } from "@/lib/processos/ctb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Análise da frota — últimos 12 meses, calculada na hora a partir dos
// registros (consumo, manutenção, multa, alocação). Não existe coluna de
// "custo" persistida: o número sai do dado cru toda vez, e muda quando o dado
// é corrigido.
//
// Três honestidades desta tela, todas deliberadas:
// 1. Km rodados vêm do DELTA de hodômetro registrado nos abastecimentos — sem
//    hodômetro registrado, a coluna diz "sem dado", nunca zero. Zero seria
//    mentira com cara de economia.
// 2. O custo por condutor atribui multa a quem foi INDICADO e consumo a quem
//    o registro diz — não a quem "provavelmente dirigia".
// 3. Amostra pequena não vira ranking: condutor com menos de 3 abastecimentos
//    registrados aparece com a marca "poucos dados" em vez de liderar a lista
//    de econômicos por sorte.
const MESES_JANELA = 12;
const MIN_REGISTROS_RENDIMENTO = 3;

function real(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function AnaliseFrotaPage({
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
  const inicioJanela = new Date(hoje.getTime() - MESES_JANELA * 30 * 86_400_000);

  const [empresa, veiculos, consumos, manutencoes, infracoes] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo }, situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
      orderBy: { placa: "asc" },
      select: { id: true, placa: true, modelo: true, motorizacao: true },
    }),
    prisma.consumoVeiculo.findMany({
      where: { empresaId: { in: escopo }, data: { gte: inicioJanela } },
      orderBy: { data: "asc" },
      select: {
        veiculoId: true,
        condutorId: true,
        tipo: true,
        quantidade: true,
        valorTotal: true,
        hodometro: true,
        condutor: { select: { colaborador: { select: { nome: true } } } },
      },
    }),
    prisma.manutencaoVeiculo.groupBy({
      by: ["veiculoId", "tipo"],
      where: { empresaId: { in: escopo }, data: { gte: inicioJanela } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    prisma.infracao.findMany({
      where: { empresaId: { in: escopo }, dataHoraInfracao: { gte: inicioJanela } },
      select: { veiculoId: true, condutorIndicadoId: true, valorOriginal: true },
    }),
  ]);
  if (!empresa) notFound();

  // ── Por veículo ────────────────────────────────────────────────────────────
  type LinhaVeiculo = {
    id: string;
    placa: string;
    modelo: string | null;
    kmRodados: number | null;
    custoConsumo: number;
    custoManutencao: number;
    corretivas: number;
    custoMultas: number;
    total: number;
    porKm: number | null;
  };

  const porVeiculo = new Map<string, LinhaVeiculo>();
  for (const v of veiculos) {
    porVeiculo.set(v.id, {
      id: v.id,
      placa: v.placa,
      modelo: v.modelo,
      kmRodados: null,
      custoConsumo: 0,
      custoManutencao: 0,
      corretivas: 0,
      custoMultas: 0,
      total: 0,
      porKm: null,
    });
  }

  // Km rodados = maior hodômetro − menor hodômetro registrados na janela.
  const hodometros = new Map<string, { min: number; max: number }>();
  for (const c of consumos) {
    const linha = porVeiculo.get(c.veiculoId);
    if (!linha) continue;
    linha.custoConsumo += c.valorTotal;
    if (c.hodometro) {
      const h = hodometros.get(c.veiculoId);
      if (!h) hodometros.set(c.veiculoId, { min: c.hodometro, max: c.hodometro });
      else {
        h.min = Math.min(h.min, c.hodometro);
        h.max = Math.max(h.max, c.hodometro);
      }
    }
  }
  for (const [id, h] of hodometros) {
    const linha = porVeiculo.get(id);
    if (linha && h.max > h.min) linha.kmRodados = h.max - h.min;
  }
  for (const m of manutencoes) {
    const linha = porVeiculo.get(m.veiculoId);
    if (!linha) continue;
    linha.custoManutencao += m._sum.valor ?? 0;
    if (m.tipo === "CORRETIVA" || m.tipo === "SINISTRO") linha.corretivas += m._count._all;
  }
  for (const i of infracoes) {
    const linha = porVeiculo.get(i.veiculoId);
    if (linha) linha.custoMultas += i.valorOriginal ?? 0;
  }
  for (const linha of porVeiculo.values()) {
    linha.total = linha.custoConsumo + linha.custoManutencao + linha.custoMultas;
    if (linha.kmRodados && linha.kmRodados > 0) linha.porKm = linha.total / linha.kmRodados;
  }
  const linhasVeiculo = [...porVeiculo.values()].sort((a, b) => b.total - a.total);

  // ── Por condutor ───────────────────────────────────────────────────────────
  type LinhaCondutor = {
    id: string;
    nome: string;
    registros: number;
    kmRegistrados: number;
    quantidade: number;
    rendimento: number | null;
    poucosDados: boolean;
    multas: number;
    custoMultas: number;
  };
  const porCondutor = new Map<string, LinhaCondutor>();
  const linhaDe = (id: string, nome: string): LinhaCondutor => {
    let l = porCondutor.get(id);
    if (!l) {
      l = { id, nome, registros: 0, kmRegistrados: 0, quantidade: 0, rendimento: null, poucosDados: true, multas: 0, custoMultas: 0 };
      porCondutor.set(id, l);
    }
    return l;
  };

  // Rendimento por condutor: soma dos deltas de hodômetro dos registros DELE ÷
  // soma das quantidades DELE (mesmo modelo tanque-cheio da tela de Consumo).
  const ultimoHodometro = new Map<string, number>();
  for (const c of consumos) {
    if (c.condutorId && c.condutor) {
      const l = linhaDe(c.condutorId, c.condutor.colaborador.nome);
      l.registros++;
      const anterior = ultimoHodometro.get(c.veiculoId);
      if (c.hodometro && anterior !== undefined && c.hodometro > anterior && c.quantidade > 0) {
        l.kmRegistrados += c.hodometro - anterior;
        l.quantidade += c.quantidade;
      }
    }
    if (c.hodometro) ultimoHodometro.set(c.veiculoId, c.hodometro);
  }
  const condutoresComMulta = await prisma.condutor.findMany({
    where: { id: { in: [...new Set(infracoes.map((i) => i.condutorIndicadoId).filter(Boolean))] as string[] } },
    select: { id: true, colaborador: { select: { nome: true } } },
  });
  const nomeCondutor = new Map(condutoresComMulta.map((c) => [c.id, c.colaborador.nome]));
  for (const i of infracoes) {
    if (!i.condutorIndicadoId) continue;
    const l = linhaDe(i.condutorIndicadoId, nomeCondutor.get(i.condutorIndicadoId) ?? "—");
    l.multas++;
    l.custoMultas += i.valorOriginal ?? 0;
  }
  for (const l of porCondutor.values()) {
    if (l.quantidade > 0) l.rendimento = l.kmRegistrados / l.quantidade;
    l.poucosDados = l.registros < MIN_REGISTROS_RENDIMENTO;
  }
  const linhasCondutor = [...porCondutor.values()].sort((a, b) => (b.custoMultas + b.multas) - (a.custoMultas + a.multas));

  const temDado = consumos.length > 0 || infracoes.length > 0 || manutencoes.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Análise da frota</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Últimos 12 meses, calculados dos registros: quem custa (veículo) e quem cuida
          (condutor). Km rodados vêm do hodômetro dos abastecimentos — sem hodômetro, a conta
          diz &ldquo;sem dado&rdquo;, nunca zero.
        </p>
      </div>

      {!temDado ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Ainda não há registro de consumo, manutenção ou multa na janela. A análise nasce
            sozinha à medida que os registros entram.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Custo por veículo</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Km rodados</TableHead>
                    <TableHead className="text-right">Combustível/energia</TableHead>
                    <TableHead className="text-right">Manutenção</TableHead>
                    <TableHead className="text-right">Multas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">R$/km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasVeiculo.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium tabular-nums">
                        {formatarPlaca(v.placa)}
                        {v.modelo && <span className="ml-1 font-normal text-muted-foreground">{v.modelo}</span>}
                        {v.corretivas > 0 && (
                          <Badge variant="destructive" className="ml-2 font-normal">
                            {v.corretivas} corretiva{v.corretivas > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.kmRodados !== null ? v.kmRodados.toLocaleString("pt-BR") : (
                          <span className="text-muted-foreground">sem dado</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{real(v.custoConsumo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{real(v.custoManutencao)}</TableCell>
                      <TableCell className="text-right tabular-nums">{real(v.custoMultas)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{real(v.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.porKm !== null ? (
                          `R$ ${v.porKm.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Por condutor</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {linhasCondutor.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">
                  Nenhum consumo ou multa atribuído a condutor ainda — atribua o veículo a quem
                  dirige (Veículos › Entregar) e registre os abastecimentos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condutor</TableHead>
                      <TableHead className="text-right">Abastecimentos</TableHead>
                      <TableHead className="text-right">Rendimento médio</TableHead>
                      <TableHead className="text-right">Multas (12m)</TableHead>
                      <TableHead className="text-right">Valor em multas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasCondutor.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.registros}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.rendimento !== null && !c.poucosDados ? (
                            `${c.rendimento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/un`
                          ) : c.rendimento !== null ? (
                            <span className="text-muted-foreground" title="Menos de 3 abastecimentos — número ainda não confiável">
                              {c.rendimento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/un · poucos dados
                            </span>
                          ) : (
                            <span className="text-muted-foreground">sem dado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.multas > 0 ? (
                            <span className="font-semibold text-destructive">{c.multas}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{real(c.custoMultas)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Multa entra no condutor quando ele é indicado; consumo, quando o registro diz quem
            rodou. &ldquo;km/un&rdquo; = km por litro ou por kWh, conforme o veículo.
          </p>
        </>
      )}
    </div>
  );
}
