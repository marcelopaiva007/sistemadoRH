"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { tipoMovimentacaoLabel } from "@/lib/constants-movimentacao";
import { criariCiclo } from "@/lib/organograma";
import { valoresValidosDoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

// Sentinela do <select> para "tirar o líder atual" — distinto de campo vazio,
// que em todos os três seletores (setor/posição/líder) significa "não mudar
// isso agora". Sem essa distinção não dava para diferenciar "não mexer no
// líder" de "esta pessoa passa a não ter líder".
const SEM_SUPERVISOR = "__sem_supervisor__";

export async function registrarMovimentacao(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    include: { setor: true, posicao: true, supervisor: { select: { id: true, nome: true } } },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const tipo = String(formData.get("tipo") ?? "").trim();
  const tiposValidos = await valoresValidosDoCatalogo(empresaId, "TIPO_MOVIMENTACAO");
  if (!tiposValidos.has(tipo)) return { ok: false, error: "Selecione o tipo de movimentação." };

  const dataEfetiva = dataDoFormulario(formData.get("dataEfetiva"));
  if (!dataEfetiva) return { ok: false, error: "Informe a data efetiva." };

  const data: Record<string, unknown> = {};
  const registro: Record<string, unknown> = {};
  let mudouAlgo = false;

  const novoSetorId = String(formData.get("novoSetorId") ?? "").trim();
  if (novoSetorId) {
    if (novoSetorId === colaborador.setorId) {
      return { ok: false, error: "O novo setor é igual ao atual." };
    }
    const setor = await prisma.setor.findFirst({ where: { id: novoSetorId, empresaId, ativo: true } });
    if (!setor) return { ok: false, error: "Setor inválido para esta empresa." };
    data.setorId = novoSetorId;
    registro.setorAnteriorNome = colaborador.setor.nome;
    registro.setorNovoId = novoSetorId;
    registro.setorNovoNome = setor.nome;
    mudouAlgo = true;
  }

  const novaPosicaoId = String(formData.get("novaPosicaoId") ?? "").trim();
  if (novaPosicaoId) {
    if (novaPosicaoId === colaborador.posicaoId) {
      return { ok: false, error: "O novo cargo é igual ao atual." };
    }
    const posicao = await prisma.posicao.findFirst({ where: { id: novaPosicaoId, empresaId, ativo: true } });
    if (!posicao) return { ok: false, error: "Cargo inválido para esta empresa." };
    data.posicaoId = novaPosicaoId;
    registro.posicaoAnteriorNome = colaborador.posicao.nome;
    registro.posicaoNovaId = novaPosicaoId;
    registro.posicaoNovaNome = posicao.nome;
    mudouAlgo = true;
  }

  const novoSupervisorId = String(formData.get("novoSupervisorId") ?? "").trim();
  if (novoSupervisorId === SEM_SUPERVISOR) {
    if (!colaborador.supervisorId) return { ok: false, error: "Este colaborador já não tem líder." };
    data.supervisorId = null;
    registro.supervisorAnteriorNome = colaborador.supervisor?.nome ?? null;
    registro.supervisorNovoId = null;
    registro.supervisorNovoNome = null;
    mudouAlgo = true;
  } else if (novoSupervisorId) {
    if (novoSupervisorId === colaboradorId) {
      return { ok: false, error: "Alguém não pode liderar a si mesmo." };
    }
    if (novoSupervisorId === colaborador.supervisorId) {
      return { ok: false, error: "O novo líder é igual ao atual." };
    }
    const supervisor = await prisma.colaborador.findFirst({
      where: { id: novoSupervisorId, empresaId, ativo: true },
      select: { id: true, nome: true },
    });
    if (!supervisor) return { ok: false, error: "Líder inválido para esta empresa." };
    if (await criariCiclo(colaboradorId, novoSupervisorId)) {
      return { ok: false, error: "Essa escolha criaria um ciclo de liderança (A lidera B que lidera A)." };
    }
    data.supervisorId = novoSupervisorId;
    registro.supervisorAnteriorNome = colaborador.supervisor?.nome ?? null;
    registro.supervisorNovoId = novoSupervisorId;
    registro.supervisorNovoNome = supervisor.nome;
    mudouAlgo = true;
  }

  if (!mudouAlgo) {
    return { ok: false, error: "Selecione ao menos uma mudança: setor, cargo ou líder." };
  }

  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  await prisma.$transaction([
    prisma.colaborador.update({ where: { id: colaboradorId }, data }),
    prisma.movimentacao.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        dataEfetiva,
        motivo,
        observacoes,
        registradoPorId: usuario?.id ?? null,
        registradoPorNome: usuario?.name ?? null,
        ...registro,
      },
    }),
  ]);

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `${tipoMovimentacaoLabel(tipo)} de ${colaborador.nome} em ${formatarData(dataEfetiva)}.`,
    detalhes: registro,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  revalidatePath(`/rh/${empresaId}/organograma`);
  return { ok: true };
}

export async function excluirMovimentacao(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const movimentacao = await prisma.movimentacao.findFirst({
    where: { id, empresaId },
    select: { id: true, tipo: true, colaboradorId: true, colaborador: { select: { nome: true } } },
  });
  if (!movimentacao) return { ok: false, error: "Movimentação não encontrada." };

  // Só apaga o REGISTRO histórico; nunca desfaz a mudança de setor/cargo/líder
  // que já foi aplicada — reverter isso é uma movimentação nova, não uma
  // exclusão. Evita a confusão de "apaguei o log e a pessoa voltou de setor".
  await prisma.movimentacao.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Movimentacao",
    entidadeId: id,
    resumo: `Registro de "${tipoMovimentacaoLabel(movimentacao.tipo)}" de ${movimentacao.colaborador.nome} excluído (o estado atual do colaborador não foi alterado).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${movimentacao.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/organograma`);
  return { ok: true };
}
