"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, hojeUTC, somarMesesUTC } from "@/lib/datas";
import { CATEGORIA_RECEITA, competenciasDoContrato, vencimentoDaCompetencia } from "@/lib/processos/alugueis";
import { STATUS_COM_PRAZO_CORRENDO } from "@/lib/processos/pendencias";
import type { ActionResult } from "@/lib/constants";

// Recebimento de aluguéis do módulo Processos & Ativos.
//
// Mesmas duas regras do resto do módulo: o acesso é sempre
// `requireProcessosEmpresa`, e o `empresaId` gravado vem SEMPRE do contrato
// (buscado dentro de `empresasVisiveis`), nunca da URL — as telas são
// consolidadas, e uma parcela de outro CNPJ na lista não pode mudar de dono.

function caminho(empresaId: string) {
  return `/processos/${empresaId}`;
}

function numero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Gera (ou completa) as parcelas mensais de um contrato de aluguel.
 *
 * Idempotente: cria só as competências que faltam — o `@@unique([contratoId,
 * competencia])` e o filtro pelas já existentes garantem que rodar de novo não
 * duplica. É o que permite chamar isto tanto no cadastro quanto meses depois,
 * para estender um contrato indeterminado conforme o tempo passa.
 */
export async function gerarParcelas(input: {
  empresaId: string;
  contratoId: string;
  diaVencimento: number;
}): Promise<ActionResult & { criadas?: number }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const contrato = await prisma.contrato.findFirst({
    where: { id: input.contratoId, empresaId: { in: visiveis } },
    select: { id: true, empresaId: true, numero: true, categoria: true, status: true, dataInicio: true, dataFim: true, valorMensal: true },
  });
  if (!contrato) return { ok: false, error: "Contrato não encontrado no seu acesso." };
  if (contrato.categoria !== CATEGORIA_RECEITA) {
    return { ok: false, error: "Só contratos de receita geram aluguel a receber." };
  }
  if (!STATUS_COM_PRAZO_CORRENDO.includes(contrato.status)) {
    return { ok: false, error: "Só contratos vigentes geram parcelas — este está em rascunho ou encerrado." };
  }
  if (contrato.valorMensal === null) {
    return { ok: false, error: "O contrato precisa de um valor mensal para gerar as parcelas." };
  }
  const dia = Math.trunc(input.diaVencimento);
  if (dia < 1 || dia > 31) return { ok: false, error: "Dia de vencimento tem que ser de 1 a 31." };

  // Horizonte: 12 meses à frente de hoje para contrato sem fim — o suficiente
  // para a tela mostrar o próximo ano sem gerar parcelas até o infinito.
  const horizonte = somarMesesUTC(hojeUTC(), 12);
  const competencias = competenciasDoContrato(contrato.dataInicio, contrato.dataFim, horizonte);

  const existentes = await prisma.recebimentoAluguel.findMany({
    where: { contratoId: contrato.id },
    select: { competencia: true },
  });
  const jaTem = new Set(existentes.map((e) => e.competencia.getTime()));

  const novas = competencias
    .filter((c) => !jaTem.has(c.getTime()))
    .map((competencia) => ({
      contratoId: contrato.id,
      empresaId: contrato.empresaId,
      competencia,
      vencimento: vencimentoDaCompetencia(competencia, dia),
      valorPrevisto: contrato.valorMensal!,
    }));

  if (novas.length > 0) await prisma.recebimentoAluguel.createMany({ data: novas });

  await registrarAuditoria({
    empresaId: contrato.empresaId,
    acao: "CRIAR",
    entidade: "RecebimentoAluguel",
    entidadeId: contrato.id,
    resumo: `Gerou ${novas.length} parcela(s) de aluguel do contrato ${contrato.numero}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, criadas: novas.length };
}

/** Marca uma parcela como recebida (data + valor). */
export async function registrarRecebimento(input: {
  empresaId: string;
  id: string;
  recebidoEm: string;
  valorRecebido?: number | null;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const parcela = await prisma.recebimentoAluguel.findFirst({
    where: { id: input.id, empresaId: { in: visiveis } },
    select: { id: true, empresaId: true, valorPrevisto: true, contrato: { select: { numero: true } } },
  });
  if (!parcela) return { ok: false, error: "Parcela não encontrada no seu acesso." };

  const recebidoEm = dataDoFormulario(input.recebidoEm);
  if (!recebidoEm) return { ok: false, error: "Informe a data em que o aluguel foi recebido." };

  // Valor em branco = recebeu o previsto. Registrar diferente é para o mês em
  // que entrou mais ou menos (reajuste, desconto, atraso com juros à parte).
  const valorRecebido = numero(input.valorRecebido) ?? parcela.valorPrevisto;

  await prisma.recebimentoAluguel.update({
    where: { id: parcela.id },
    data: { recebidoEm, valorRecebido },
  });

  await registrarAuditoria({
    empresaId: parcela.empresaId,
    acao: "ATUALIZAR",
    entidade: "RecebimentoAluguel",
    entidadeId: parcela.id,
    resumo: `Recebeu aluguel do contrato ${parcela.contrato.numero}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/** Desfaz o recebimento — para o caso de ter marcado a parcela errada. */
export async function desfazerRecebimento(input: { empresaId: string; id: string }): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const parcela = await prisma.recebimentoAluguel.findFirst({
    where: { id: input.id, empresaId: { in: visiveis } },
    select: { id: true, empresaId: true, contrato: { select: { numero: true } } },
  });
  if (!parcela) return { ok: false, error: "Parcela não encontrada no seu acesso." };

  await prisma.recebimentoAluguel.update({
    where: { id: parcela.id },
    data: { recebidoEm: null, valorRecebido: null },
  });

  await registrarAuditoria({
    empresaId: parcela.empresaId,
    acao: "ATUALIZAR",
    entidade: "RecebimentoAluguel",
    entidadeId: parcela.id,
    resumo: `Desfez o recebimento de aluguel do contrato ${parcela.contrato.numero}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}
