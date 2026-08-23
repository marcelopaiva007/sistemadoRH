import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { ConsumoView, type ConsumoNaTela, type VeiculoParaConsumo } from "./consumo-view";

// Consumo da frota — combustível para os de combustão, energia para os
// elétricos. O rendimento (km/l ou km/kWh) sai da DIFERENÇA de hodômetro
// entre dois registros consecutivos do mesmo veículo: por isso a tela insiste
// no hodômetro, e por isso não existe "total do mês digitado" — o mês é só o
// recorte de leitura de uma série de eventos.
export default async function ConsumoPage({
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

  const [empresa, consumos, veiculos] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.consumoVeiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { data: "desc" },
      take: 200,
      select: {
        id: true,
        veiculoId: true,
        data: true,
        tipo: true,
        combustivel: true,
        quantidade: true,
        valorTotal: true,
        hodometro: true,
        veiculo: { select: { placa: true } },
        condutor: { select: { colaborador: { select: { nome: true } } } },
      },
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo }, situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
      orderBy: { placa: "asc" },
      select: {
        id: true,
        placa: true,
        modelo: true,
        motorizacao: true,
        alocacoes: {
          where: { dataFim: null },
          take: 1,
          select: { condutor: { select: { colaborador: { select: { nome: true } } } } },
        },
      },
    }),
  ]);
  if (!empresa) notFound();

  // Rendimento: km rodados desde o registro ANTERIOR (por hodômetro) dividido
  // pela quantidade DESTE registro (modelo tanque-cheio simplificado). Os
  // consumos vêm em ordem decrescente; o "anterior" é o próximo da lista com
  // hodômetro do mesmo veículo.
  const anteriores = new Map<string, number>();
  const rendimento = new Map<string, number>();
  for (let i = consumos.length - 1; i >= 0; i--) {
    const c = consumos[i];
    if (!c.hodometro) continue;
    const anterior = anteriores.get(c.veiculoId);
    if (anterior !== undefined && c.hodometro > anterior && c.quantidade > 0) {
      rendimento.set(c.id, (c.hodometro - anterior) / c.quantidade);
    }
    anteriores.set(c.veiculoId, c.hodometro);
  }

  const naTela: ConsumoNaTela[] = consumos.map((c) => ({
    id: c.id,
    placa: c.veiculo.placa,
    dataTexto: formatarData(c.data),
    tipo: c.tipo,
    combustivel: c.combustivel,
    quantidade: c.quantidade,
    valorTotal: c.valorTotal,
    hodometro: c.hodometro,
    condutorNome: c.condutor?.colaborador.nome ?? null,
    rendimento: rendimento.get(c.id) ?? null,
  }));

  const paraForm: VeiculoParaConsumo[] = veiculos.map((v) => ({
    id: v.id,
    placa: v.placa,
    modelo: v.modelo,
    motorizacao: v.motorizacao,
    condutorAtual: v.alocacoes[0]?.condutor.colaborador.nome ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Consumo</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Abastecimentos e recargas, com o rendimento calculado pelo hodômetro. A leitura por
          veículo e por condutor está em Análise.
        </p>
      </div>

      <ConsumoView empresaId={empresaId} consumos={naTela} veiculos={paraForm} />
    </div>
  );
}
