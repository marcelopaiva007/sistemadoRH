"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData, somarDiasUTC } from "@/lib/datas";
import { calcularFerias, validarSolicitacaoFerias, DIAS_FERIAS_POR_PERIODO } from "@/lib/ferias";
import type { ActionResult } from "@/lib/constants";

async function carregarContexto(empresaId: string, colaboradorId: string) {
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, dataAdmissao: true },
  });
  if (!colaborador) return null;

  const solicitacoes = await prisma.solicitacaoFerias.findMany({
    where: { colaboradorId, status: { in: ["APROVADA", "PENDENTE"] } },
    select: { id: true, periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
  });
  return { colaborador, solicitacoes };
}

export async function solicitarFerias(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const ctx = await carregarContexto(empresaId, colaboradorId);
  if (!ctx) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!ctx.colaborador.dataAdmissao) {
    return {
      ok: false,
      error: "Preencha a data de admissão na ficha do colaborador antes de programar férias.",
    };
  }

  const periodoAquisitivoInicio = dataDoFormulario(formData.get("periodoAquisitivoInicio"));
  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!periodoAquisitivoInicio) return { ok: false, error: "Selecione o período aquisitivo." };
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o início e o fim das férias." };

  const diasAbono = Number.parseInt(String(formData.get("diasAbono") ?? "0"), 10) || 0;
  const decimoAntecipado = formData.get("decimoAntecipado") === "true";
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  const resumo = calcularFerias(ctx.colaborador.dataAdmissao, ctx.solicitacoes);
  const validacao = validarSolicitacaoFerias({
    resumo,
    periodoAquisitivoInicio,
    dataInicio,
    dataFim,
    diasAbono,
    fracoesExistentes: ctx.solicitacoes.filter(
      (s) => s.periodoAquisitivoInicio.getTime() === periodoAquisitivoInicio.getTime(),
    ),
  });
  if (!validacao.ok) return { ok: false, error: validacao.error };

  // Duas férias sobrepostas para a mesma pessoa é sempre erro de digitação.
  const conflito = await prisma.solicitacaoFerias.findFirst({
    where: {
      colaboradorId,
      status: { in: ["APROVADA", "PENDENTE"] },
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
    select: { dataInicio: true, dataFim: true },
  });
  if (conflito) {
    return {
      ok: false,
      error: `Já existe um período de férias de ${formatarData(conflito.dataInicio)} a ${formatarData(conflito.dataFim)} que se sobrepõe a este.`,
    };
  }

  const solicitacao = await prisma.solicitacaoFerias.create({
    data: {
      empresaId,
      colaboradorId,
      periodoAquisitivoInicio,
      dataInicio,
      dataFim,
      dias: validacao.dias,
      diasAbono,
      decimoAntecipado,
      observacoes,
      solicitadoPorId: usuario?.id ?? null,
      solicitadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "SolicitacaoFerias",
    entidadeId: solicitacao.id,
    resumo: `Férias de ${ctx.colaborador.nome} solicitadas: ${formatarData(dataInicio)} a ${formatarData(dataFim)} (${validacao.dias} dias).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function decidirFerias(
  empresaId: string,
  id: string,
  decisao: "APROVADA" | "REPROVADA" | "CANCELADA",
  motivo?: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const solicitacao = await prisma.solicitacaoFerias.findFirst({
    where: { id, empresaId },
    select: {
      id: true,
      status: true,
      colaboradorId: true,
      dataInicio: true,
      dataFim: true,
      dias: true,
      diasAbono: true,
      periodoAquisitivoInicio: true,
      colaborador: { select: { nome: true, dataAdmissao: true } },
    },
  });
  if (!solicitacao) return { ok: false, error: "Solicitação não encontrada nesta empresa." };
  // Aprovar/reprovar só vale para pendente; cancelar também vale para férias já
  // aprovadas que não vão mais acontecer (o registro fica, com o motivo).
  const permitido =
    solicitacao.status === "PENDENTE" ||
    (decisao === "CANCELADA" && solicitacao.status === "APROVADA");
  if (!permitido) {
    return { ok: false, error: `Não é possível ${decisao.toLowerCase()} uma solicitação ${solicitacao.status.toLowerCase()}.` };
  }

  // Entre o pedido e a aprovação outras férias podem ter consumido o saldo —
  // revalida contra o estado atual antes de aprovar.
  if (decisao === "APROVADA" && solicitacao.colaborador.dataAdmissao) {
    const outras = await prisma.solicitacaoFerias.findMany({
      where: {
        colaboradorId: solicitacao.colaboradorId,
        status: { in: ["APROVADA", "PENDENTE"] },
        id: { not: id },
      },
      select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
    });
    const resumo = calcularFerias(solicitacao.colaborador.dataAdmissao, outras);
    const periodo = resumo.periodos.find(
      (p) => p.inicio.getTime() === solicitacao.periodoAquisitivoInicio.getTime(),
    );
    if (!periodo || periodo.saldo < solicitacao.dias + solicitacao.diasAbono) {
      return {
        ok: false,
        error: `Não há mais saldo neste período aquisitivo (restam ${periodo?.saldo ?? 0} dia(s)). Reprove ou peça um novo período.`,
      };
    }
  }

  await prisma.solicitacaoFerias.update({
    where: { id },
    data: {
      status: decisao,
      decididoPorId: usuario?.id ?? null,
      decididoPorNome: usuario?.name ?? null,
      decididoEm: new Date(),
      motivoDecisao: motivo?.trim() || null,
    },
  });

  const acao = decisao === "APROVADA" ? "APROVAR" : decisao === "REPROVADA" ? "REPROVAR" : "CANCELAR";
  await registrarAuditoria({
    empresaId,
    acao,
    entidade: "SolicitacaoFerias",
    entidadeId: id,
    resumo: `Férias de ${solicitacao.colaborador.nome} (${formatarData(solicitacao.dataInicio)} a ${formatarData(solicitacao.dataFim)}) — ${decisao.toLowerCase()}.`,
    detalhes: motivo ? { motivo } : undefined,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${solicitacao.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

/**
 * Lança férias que JÁ foram gozadas, direto como APROVADA.
 *
 * Existe porque a base nasceu sem histórico de gozo: a planilha do DP só trazia
 * o marco do período aquisitivo em aberto, não os períodos já tirados. Sem isso
 * o motor assume que ninguém nunca saiu de férias e acusa como vencido todo
 * mundo com mais de dois anos de casa.
 *
 * Não passa pelo fluxo de aprovação de propósito — é registro retroativo do RH,
 * não pedido. As demais regras (saldo, fracionamento, sobreposição) continuam
 * valendo, senão o lançamento de correção viraria porta para estourar o saldo.
 */
export async function registrarFeriasGozadas(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const ctx = await carregarContexto(empresaId, colaboradorId);
  if (!ctx) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!ctx.colaborador.dataAdmissao) {
    return {
      ok: false,
      error: "Preencha a data de admissão na ficha antes de lançar férias já gozadas.",
    };
  }

  const periodoAquisitivoInicio = dataDoFormulario(formData.get("periodoAquisitivoInicio"));
  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!periodoAquisitivoInicio) return { ok: false, error: "Selecione o período aquisitivo." };
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o início e o fim das férias." };

  const diasAbono = Number.parseInt(String(formData.get("diasAbono") ?? "0"), 10) || 0;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  const resumo = calcularFerias(ctx.colaborador.dataAdmissao, ctx.solicitacoes);
  const validacao = validarSolicitacaoFerias({
    resumo,
    periodoAquisitivoInicio,
    dataInicio,
    dataFim,
    diasAbono,
    fracoesExistentes: ctx.solicitacoes.filter(
      (s) => s.periodoAquisitivoInicio.getTime() === periodoAquisitivoInicio.getTime(),
    ),
  });
  if (!validacao.ok) return { ok: false, error: validacao.error };

  const conflito = await prisma.solicitacaoFerias.findFirst({
    where: {
      colaboradorId,
      status: { in: ["APROVADA", "PENDENTE"] },
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
    select: { dataInicio: true, dataFim: true },
  });
  if (conflito) {
    return {
      ok: false,
      error: `Já existe um período de ${formatarData(conflito.dataInicio)} a ${formatarData(conflito.dataFim)} que se sobrepõe a este.`,
    };
  }

  const agora = new Date();
  const solicitacao = await prisma.solicitacaoFerias.create({
    data: {
      empresaId,
      colaboradorId,
      periodoAquisitivoInicio,
      dataInicio,
      dataFim,
      dias: validacao.dias,
      diasAbono,
      decimoAntecipado: false,
      observacoes,
      status: "APROVADA",
      solicitadoPorId: usuario?.id ?? null,
      solicitadoPorNome: usuario?.name ?? null,
      decididoPorId: usuario?.id ?? null,
      decididoPorNome: usuario?.name ?? null,
      decididoEm: agora,
      motivoDecisao: "Registro retroativo de férias já gozadas.",
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "SolicitacaoFerias",
    entidadeId: solicitacao.id,
    resumo: `Férias já gozadas de ${ctx.colaborador.nome} registradas pelo RH: ${formatarData(dataInicio)} a ${formatarData(dataFim)} (${validacao.dias} dias).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/ferias`);
  return { ok: true };
}

/**
 * Concilia o saldo de férias de quem veio da importação sem histórico de gozo:
 * em vez do RH lançar período por período com data exata (que ele não tem),
 * informa só o saldo atual em dias e o sistema faz a conta reversa.
 *
 * Consome os períodos aquisitivos do MAIS ANTIGO para o MAIS NOVO até bater o
 * saldo informado — decisão de negócio (não é a única leitura possível: o
 * inverso, mais novo primeiro, é mais conservador para o passivo em dobro do
 * art. 137, mas o RH optou por esta por ser mais fiel ao padrão real de uso
 * aqui). Cada período consumido vira uma SolicitacaoFerias APROVADA, com
 * `dataInicio`/`dataFim` sintéticas (dentro do próprio período, só para o
 * intervalo bater com `dias`) — a observação deixa claro que a data de gozo
 * real é desconhecida, só o saldo resultante é fato.
 *
 * Só aceita colaborador SEM nenhuma solicitação ainda: é exatamente o estado
 * de quem caiu em `semHistoricoDeFerias`. Com histórico já lançado, o RH usa
 * "Lançar férias já gozadas" período a período — misturar os dois métodos no
 * mesmo colaborador é caminho para contar dia duas vezes.
 */
export async function conciliarSaldoFerias(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const ctx = await carregarContexto(empresaId, colaboradorId);
  if (!ctx) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!ctx.colaborador.dataAdmissao) {
    return {
      ok: false,
      error: "Preencha a data de admissão na ficha antes de conciliar o saldo de férias.",
    };
  }
  if (ctx.solicitacoes.length > 0) {
    return {
      ok: false,
      error:
        "Este colaborador já tem férias lançadas. Para ajustar um período específico, use \"Lançar férias já gozadas\" — conciliar saldo é só para quem ainda não tem nenhum registro.",
    };
  }

  const diasAtuais = Number.parseInt(String(formData.get("diasAtuais") ?? ""), 10);
  if (!Number.isFinite(diasAtuais) || diasAtuais < 0) {
    return { ok: false, error: "Informe o saldo atual em dias (número inteiro, 0 ou mais)." };
  }

  const resumo = calcularFerias(ctx.colaborador.dataAdmissao, []);
  const adquiridos = resumo.periodos.filter((p) => p.status !== "EM_CURSO");
  const totalAcumulado = adquiridos.length * DIAS_FERIAS_POR_PERIODO;

  if (adquiridos.length === 0) {
    return {
      ok: false,
      error: "Esta pessoa ainda não completou 12 meses de casa — não há período aquisitivo fechado para conciliar.",
    };
  }
  if (diasAtuais > totalAcumulado) {
    return {
      ok: false,
      error: `O saldo informado (${diasAtuais} dias) é maior que o total acumulado desde a admissão: ${totalAcumulado} dias em ${adquiridos.length} período(s) completo(s).`,
    };
  }

  let aUsar = totalAcumulado - diasAtuais;
  // aUsar === 0 quando o saldo informado bate com o total acumulado: o loop
  // abaixo não cria nenhum registro (é exatamente o que o sistema já assumia
  // sem lançamento nenhum), mas a auditoria abaixo registra que o RH conferiu
  // e confirmou — vale mais que silêncio, mesmo sem SolicitacaoFerias criada.
  const observacoes = String(formData.get("observacoes") ?? "").trim();
  const agora = new Date();
  const registros: { periodoAquisitivoInicio: Date; dataInicio: Date; dataFim: Date; dias: number }[] = [];

  for (const periodo of adquiridos) {
    if (aUsar <= 0) break;
    const consumido = Math.min(DIAS_FERIAS_POR_PERIODO, aUsar);
    registros.push({
      periodoAquisitivoInicio: periodo.inicio,
      dataInicio: periodo.inicio,
      dataFim: somarDiasUTC(periodo.inicio, consumido - 1),
      dias: consumido,
    });
    aUsar -= consumido;
  }

  const notaBase =
    `Conciliação de saldo: RH informou ${diasAtuais} dia(s) de saldo atual em ${formatarData(agora)}, ` +
    `de um total de ${totalAcumulado} dia(s) acumulados desde a admissão. Data de gozo é estimada — ` +
    "não há registro de quando a pessoa efetivamente saiu de férias, só o saldo resultante." +
    (observacoes ? ` Nota do RH: ${observacoes}` : "");

  await prisma.$transaction(
    registros.map((r) =>
      prisma.solicitacaoFerias.create({
        data: {
          empresaId,
          colaboradorId,
          periodoAquisitivoInicio: r.periodoAquisitivoInicio,
          dataInicio: r.dataInicio,
          dataFim: r.dataFim,
          dias: r.dias,
          diasAbono: 0,
          decimoAntecipado: false,
          status: "APROVADA",
          observacoes: notaBase,
          solicitadoPorId: usuario?.id ?? null,
          solicitadoPorNome: usuario?.name ?? null,
          decididoPorId: usuario?.id ?? null,
          decididoPorNome: usuario?.name ?? null,
          decididoEm: agora,
          motivoDecisao: "Conciliação de saldo informado pelo RH (dados legados sem histórico de gozo).",
        },
      }),
    ),
  );

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo:
      `Saldo de férias de ${ctx.colaborador.nome} conciliado pelo RH: informado ${diasAtuais} de ${totalAcumulado} ` +
      `dias acumulados — ${totalAcumulado - diasAtuais} dia(s) marcados como já gozados em ${registros.length} período(s), do mais antigo para o mais novo.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/ferias`);
  return { ok: true };
}

export async function excluirSolicitacaoFerias(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const solicitacao = await prisma.solicitacaoFerias.findFirst({
    where: { id, empresaId },
    select: {
      id: true,
      status: true,
      colaboradorId: true,
      dataInicio: true,
      dataFim: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!solicitacao) return { ok: false, error: "Solicitação não encontrada nesta empresa." };
  if (solicitacao.status === "APROVADA") {
    return {
      ok: false,
      error: "Férias já aprovadas não são excluídas — cancele para manter o histórico.",
    };
  }

  await prisma.solicitacaoFerias.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SolicitacaoFerias",
    entidadeId: id,
    resumo: `Solicitação de férias de ${solicitacao.colaborador.nome} (${formatarData(solicitacao.dataInicio)} a ${formatarData(solicitacao.dataFim)}) excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${solicitacao.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  return { ok: true };
}
