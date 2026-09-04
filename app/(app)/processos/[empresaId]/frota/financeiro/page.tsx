import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { retratoFinanceiro } from "@/lib/processos/frota-financeiro";
import { FinanceiroView, type LinhaFinanceiro } from "./financeiro-view";

// Financeiro da Frota (spec de 31/08/2026): a situação de pagamento de cada
// veículo — quitado, financiado, consórcio, leasing, alugado — ordenada pelo
// que vence primeiro. Todo cálculo (vencimento, semáforo, saldo) acontece AQUI
// no servidor, via lib/processos/frota-financeiro.ts; a view só exibe.
export default async function FinanceiroFrotaPage({
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

  const [empresa, veiculos, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    // Um findMany só, com o financeiro no include — nunca uma consulta por
    // linha (§6.5). Veículo sem registro entra como SEM_DADOS.
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo } },
      orderBy: { placa: "asc" },
      select: {
        id: true,
        placa: true,
        marca: true,
        modelo: true,
        situacao: true,
        empresaId: true,
        financeiro: {
          select: {
            tipoAquisicao: true,
            situacao: true,
            credor: true,
            contratoNumero: true,
            valorTotal: true,
            valorParcela: true,
            qtdParcelasTotal: true,
            qtdParcelasPagas: true,
            dataPrimeiraParcela: true,
            recorrencia: true,
            recorrenciaIntervaloDias: true,
            dataProximoVencimento: true,
            observacoes: true,
          },
        },
      },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  const linhas: LinhaFinanceiro[] = veiculos.map((v) => {
    const f = v.financeiro;
    const ret = retratoFinanceiro(f, hoje);
    return {
      veiculoId: v.id,
      placa: v.placa,
      modelo: [v.marca, v.modelo].filter(Boolean).join(" ") || "—",
      empresaNome: nomeDaEmpresa.get(v.empresaId) ?? "—",
      temRegistro: !!f,
      tipoAquisicao: f?.tipoAquisicao ?? "",
      situacao: f?.situacao ?? "",
      credor: f?.credor ?? "",
      contratoNumero: f?.contratoNumero ?? "",
      valorTotal: f?.valorTotal ?? null,
      valorParcela: f?.valorParcela ?? null,
      qtdParcelasTotal: f?.qtdParcelasTotal ?? null,
      qtdParcelasPagas: f?.qtdParcelasPagas ?? 0,
      dataPrimeiraParcelaInput: f?.dataPrimeiraParcela ? paraInputDate(f.dataPrimeiraParcela) : "",
      recorrencia: f?.recorrencia ?? "MENSAL",
      recorrenciaIntervaloDias: f?.recorrenciaIntervaloDias ?? null,
      vencimentoManualInput: f?.dataProximoVencimento ? paraInputDate(f.dataProximoVencimento) : "",
      observacoes: f?.observacoes ?? "",
      // Derivados prontos (§4): o front não refaz conta nenhuma.
      status: ret.status,
      vencimentoTexto: ret.proximoVencimento ? formatarData(ret.proximoVencimento) : null,
      // Ordenação estável no cliente sem reparsear data: timestamp direto.
      vencimentoTs: ret.proximoVencimento ? ret.proximoVencimento.getTime() : null,
      dias: ret.diasParaVencimento,
      parcelasRestantes: ret.parcelasRestantes,
      saldoDevedor: ret.saldoDevedor,
      quitacaoPrevistaTexto: ret.dataQuitacaoPrevista ? formatarData(ret.dataQuitacaoPrevista) : null,
    };
  });

  // Cards de resumo (§5.1). "A pagar no mês" = parcelas cujo vencimento cai no
  // mês corrente — as vencidas do mês contam (ainda precisam ser pagas).
  const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)).getTime();
  const fimMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getTime();
  const resumo = {
    vencidos: linhas.filter((l) => l.status === "VENCIDO").length,
    proximos: linhas.filter((l) => l.status === "PROXIMO").length,
    aPagarNoMes: linhas
      .filter(
        (l) =>
          l.vencimentoTs != null && l.vencimentoTs >= inicioMes && l.vencimentoTs <= fimMes && l.valorParcela,
      )
      .reduce((soma, l) => soma + (l.valorParcela ?? 0), 0),
    saldoDevedorTotal: linhas.reduce((soma, l) => soma + (l.saldoDevedor ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Financeiro da Frota</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Como cada veículo foi adquirido e o que ainda está sendo pago — ordenado pelo que vence
          primeiro. Registrar a parcela paga é o que avança o vencimento.
        </p>
      </div>

      <FinanceiroView empresaId={empresaId} linhas={linhas} resumo={resumo} />
    </div>
  );
}
