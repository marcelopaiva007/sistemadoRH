"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { formatarPlaca } from "@/lib/processos/ctb";
import { validarFinanceiro } from "@/lib/processos/frota-financeiro";
import type { ActionResult } from "@/lib/constants";

// Server actions do Financeiro da Frota — a ÚNICA porta de escrita, no mesmo
// molde de processos-frota.ts: a decisão mora em lib/processos/
// frota-financeiro.ts (puro, testado), aqui mora a execução com IDOR guard,
// auditoria e revalidate. A spec pedia rotas REST (§7); o padrão do projeto é
// server action, e padrão ganha de spec (premissa declarada da própria spec).

function caminho(empresaId: string) {
  return `/processos/${empresaId}`;
}

/** O veículo, SÓ se estiver no alcance de quem chama (IDOR fechado na origem). */
async function veiculoNoAlcance(veiculoId: string, usuario: Parameters<typeof empresasVisiveis>[0]) {
  const visiveis = await empresasVisiveis(usuario);
  return prisma.veiculo.findFirst({
    where: { id: veiculoId, empresaId: { in: visiveis } },
    select: { id: true, empresaId: true, placa: true },
  });
}

export type FinanceiroInput = {
  empresaId: string;
  veiculoId: string;
  tipoAquisicao: string;
  situacao: string;
  credor?: string | null;
  contratoNumero?: string | null;
  valorTotal?: number | null;
  valorParcela?: number | null;
  qtdParcelasTotal?: number | null;
  qtdParcelasPagas?: number | null;
  dataPrimeiraParcela?: string | null;
  recorrencia?: string | null;
  recorrenciaIntervaloDias?: number | null;
  /** Preenchido = override manual (§3.2). Vazio = o cálculo manda. */
  dataProximoVencimento?: string | null;
  observacoes?: string | null;
};

/** Cria ou atualiza o financeiro do veículo — upsert pela relação 1:1. */
export async function salvarFinanceiroVeiculo(input: FinanceiroInput): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const veiculo = await veiculoNoAlcance(input.veiculoId, usuario);
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  const registro = {
    tipoAquisicao: input.tipoAquisicao,
    situacao: input.situacao,
    valorParcela: input.valorParcela ?? null,
    qtdParcelasTotal: input.qtdParcelasTotal ?? null,
    qtdParcelasPagas: input.qtdParcelasPagas ?? 0,
    dataPrimeiraParcela: dataDoFormulario(input.dataPrimeiraParcela ?? null),
    recorrencia: input.recorrencia || "MENSAL",
    recorrenciaIntervaloDias: input.recorrenciaIntervaloDias ?? null,
    dataProximoVencimento: dataDoFormulario(input.dataProximoVencimento ?? null),
  };
  const veredito = validarFinanceiro(registro);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  // Última parcela paga = quitou (§3.5): a situação vira QUITADO e o override
  // manual é limpo — quitado não tem vencimento para mostrar.
  const quitouAgora =
    registro.qtdParcelasTotal != null && registro.qtdParcelasPagas >= registro.qtdParcelasTotal;

  const dados = {
    ...registro,
    situacao: quitouAgora ? "QUITADO" : registro.situacao,
    dataProximoVencimento: quitouAgora ? null : registro.dataProximoVencimento,
    // O dono do registro segue o dono do veículo — nunca o da URL, que numa
    // tela consolidada pode ser outro CNPJ do grupo.
    empresaId: veiculo.empresaId,
    credor: (input.credor ?? "").trim().slice(0, 120) || null,
    contratoNumero: (input.contratoNumero ?? "").trim().slice(0, 60) || null,
    valorTotal:
      typeof input.valorTotal === "number" && input.valorTotal > 0 ? input.valorTotal : null,
    observacoes: (input.observacoes ?? "").trim().slice(0, 1000) || null,
  };

  const financeiro = await prisma.veiculoFinanceiro.upsert({
    where: { veiculoId: veiculo.id },
    create: {
      ...dados,
      veiculoId: veiculo.id,
      criadoPorId: usuario.id,
      criadoPorNome: usuario.name ?? usuario.username,
    },
    update: dados,
  });

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: "ATUALIZAR",
    entidade: "VeiculoFinanceiro",
    entidadeId: financeiro.id,
    resumo:
      `Salvou o financeiro do veículo ${formatarPlaca(veiculo.placa)}` +
      (quitouAgora ? " — QUITADO (todas as parcelas pagas)" : ""),
  });
  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/**
 * "Registrar parcela paga" — incrementa 1 e deixa o cálculo avançar a data.
 * O override manual é LIMPO aqui: ele apontava para a parcela que acabou de
 * ser paga, e mantê-lo deixaria o veículo eternamente vencido na data velha.
 * Guarda de concorrência no `pagas` lido: dois cliques não pagam duas.
 */
export async function registrarParcelaPaga(input: {
  empresaId: string;
  veiculoId: string;
}): Promise<ActionResult & { quitado?: boolean }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const veiculo = await veiculoNoAlcance(input.veiculoId, usuario);
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  const atual = await prisma.veiculoFinanceiro.findUnique({
    where: { veiculoId: veiculo.id },
    select: { id: true, situacao: true, qtdParcelasPagas: true, qtdParcelasTotal: true },
  });
  if (!atual) return { ok: false, error: "Este veículo ainda não tem registro financeiro." };
  if (atual.situacao !== "EM_PAGAMENTO") {
    return { ok: false, error: "Só se registra parcela de veículo em pagamento." };
  }
  if (atual.qtdParcelasTotal != null && atual.qtdParcelasPagas >= atual.qtdParcelasTotal) {
    return { ok: false, error: "Todas as parcelas já estão pagas." };
  }

  const novasPagas = atual.qtdParcelasPagas + 1;
  const quita = atual.qtdParcelasTotal != null && novasPagas >= atual.qtdParcelasTotal;

  const { count } = await prisma.veiculoFinanceiro.updateMany({
    where: { id: atual.id, qtdParcelasPagas: atual.qtdParcelasPagas },
    data: {
      qtdParcelasPagas: novasPagas,
      dataProximoVencimento: null,
      ...(quita ? { situacao: "QUITADO" } : {}),
    },
  });
  if (count === 0) {
    return { ok: false, error: "Outra pessoa registrou uma parcela agora — recarregue e confira." };
  }

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: "ATUALIZAR",
    entidade: "VeiculoFinanceiro",
    entidadeId: atual.id,
    resumo:
      `Registrou parcela paga (${novasPagas}${atual.qtdParcelasTotal ? `/${atual.qtdParcelasTotal}` : ""}) ` +
      `do veículo ${formatarPlaca(veiculo.placa)}` +
      (quita ? " — QUITADO" : ""),
  });
  revalidatePath(caminho(input.empresaId));
  return { ok: true, quitado: quita };
}

/** Remove SÓ o vínculo financeiro — o veículo fica intacto (§9). */
export async function excluirFinanceiroVeiculo(input: {
  empresaId: string;
  veiculoId: string;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const veiculo = await veiculoNoAlcance(input.veiculoId, usuario);
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  const existente = await prisma.veiculoFinanceiro.findUnique({
    where: { veiculoId: veiculo.id },
    select: { id: true },
  });
  if (!existente) return { ok: false, error: "Este veículo não tem registro financeiro." };

  await prisma.veiculoFinanceiro.delete({ where: { id: existente.id } });
  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: "EXCLUIR",
    entidade: "VeiculoFinanceiro",
    entidadeId: existente.id,
    resumo: `Removeu o registro financeiro do veículo ${formatarPlaca(veiculo.placa)}`,
  });
  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}
