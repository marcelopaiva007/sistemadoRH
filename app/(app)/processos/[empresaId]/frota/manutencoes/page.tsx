import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData } from "@/lib/datas";
import { ManutencoesView, type ManutencaoNaTela } from "./manutencoes-view";

// Manutenções da frota. "Próxima revisão" preenchida vira pendência na
// Central; o tipo (corretiva × preventiva) alimenta a Análise — carro que só
// aparece em corretiva é carro que está avisando que vai embora.
export default async function ManutencoesPage({
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

  const [empresa, manutencoes, veiculos] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.manutencaoVeiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { data: "desc" },
      take: 200,
      select: {
        id: true,
        tipo: true,
        descricao: true,
        data: true,
        valor: true,
        fornecedor: true,
        proximaRevisaoData: true,
        proximaRevisaoKm: true,
        veiculo: { select: { placa: true } },
      },
    }),
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo }, situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
      orderBy: { placa: "asc" },
      select: { id: true, placa: true, modelo: true },
    }),
  ]);
  if (!empresa) notFound();

  const naTela: ManutencaoNaTela[] = manutencoes.map((m) => ({
    id: m.id,
    placa: m.veiculo.placa,
    dataTexto: formatarData(m.data),
    tipo: m.tipo,
    descricao: m.descricao,
    valor: m.valor,
    fornecedor: m.fornecedor,
    proximaRevisaoTexto: m.proximaRevisaoData ? formatarData(m.proximaRevisaoData) : null,
    proximaRevisaoKm: m.proximaRevisaoKm,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Manutenções</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O histórico de cada carro. Preencha a próxima revisão — ela vira aviso na Central antes
          de virar quebra na rua.
        </p>
      </div>

      <ManutencoesView empresaId={empresaId} manutencoes={naTela} veiculos={veiculos} />
    </div>
  );
}
