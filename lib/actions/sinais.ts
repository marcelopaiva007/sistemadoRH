"use server";

// Ações da Central de Sinais — os três desfechos de um cartão (reconhecer,
// virar plano, descartar com motivo) mais a atribuição manual de dono/prazo.
//
// Escopo: o sinal pode pertencer a um CNPJ (empresaId) ou ao grupo/marca
// (empresaId nulo). Quem age precisa de acesso à empresa da ROTA (é por onde
// chegou) e, se o sinal é de um CNPJ, também enxergá-lo em empresasVisiveis —
// um id de sinal digitado à mão não vira acesso a outro CNPJ.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { formatarData, hojeUTC, somarDiasUTC, dataDoFormulario } from "@/lib/datas";
import { STATUS_SINAL_VIVOS, tipoSinalLabel, type StatusSinal } from "@/lib/sinais";
import type { ActionResult } from "@/lib/constants";

/**
 * Sem prazo escolhido no cartão, o plano nasce com 30 dias — um plano precisa
 * de prazo (coluna NOT NULL) e "sem prazo" viraria "sem cobrança". O número
 * aparece na descrição do plano para ninguém achar que foi decisão de gente.
 */
const PRAZO_PADRAO_PLANO_DIAS = 30;

async function sinalNoEscopo(
  empresaIdRota: string,
  sinalId: string,
): Promise<
  | { erro: string }
  | { usuario: Awaited<ReturnType<typeof requireEmpresaAccess>>; sinal: NonNullable<Awaited<ReturnType<typeof prisma.sinal.findUnique>>> }
> {
  const usuario = await requireEmpresaAccess(empresaIdRota);
  const sinal = await prisma.sinal.findUnique({ where: { id: sinalId } });
  if (!sinal) return { erro: "Sinal não encontrado." };
  if (sinal.empresaId) {
    const visiveis = await empresasVisiveis(usuario);
    if (!visiveis.includes(sinal.empresaId)) {
      return { erro: "Este sinal está fora do seu escopo." };
    }
  }
  return { usuario, sinal } as const;
}

function vivo(status: string): boolean {
  return STATUS_SINAL_VIVOS.includes(status as StatusSinal);
}

/** "Reconheci" — eu vi, é real, ainda não virou plano. Vale também para tirar um sinal do silêncio. */
export async function reconhecerSinal(empresaIdRota: string, sinalId: string): Promise<ActionResult> {
  const r = await sinalNoEscopo(empresaIdRota, sinalId);
  if ("erro" in r) return { ok: false, error: r.erro };
  if (r.sinal.status !== "ABERTO" && r.sinal.status !== "SILENCIADO") {
    return { ok: false, error: "Só um sinal aberto ou silenciado pode ser reconhecido." };
  }

  await prisma.sinal.update({
    where: { id: sinalId },
    data: { status: "RECONHECIDO", statusEm: new Date(), silenciadoAte: null },
  });

  await registrarAuditoria({
    empresaId: r.sinal.empresaId,
    acao: "ATUALIZAR",
    entidade: "Sinal",
    entidadeId: sinalId,
    resumo: `Sinal "${tipoSinalLabel(r.sinal.tipo)}" (${r.sinal.unidadeNome}) reconhecido.`,
  });

  revalidatePath(`/rh/${empresaIdRota}/sinais`);
  return { ok: true };
}

/** Descartar EXIGE motivo escrito — é o motivo que alimenta a regra de silêncio e a auditoria. */
export async function descartarSinal(
  empresaIdRota: string,
  sinalId: string,
  motivo: string,
): Promise<ActionResult> {
  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length < 5) {
    return { ok: false, error: "Escreva o motivo do descarte — sem motivo, o descarte não acontece." };
  }

  const r = await sinalNoEscopo(empresaIdRota, sinalId);
  if ("erro" in r) return { ok: false, error: r.erro };
  if (!vivo(r.sinal.status) && r.sinal.status !== "SILENCIADO") {
    return { ok: false, error: "Este sinal já foi descartado." };
  }

  await prisma.sinal.update({
    where: { id: sinalId },
    data: {
      status: "DESCARTADO",
      motivoDescarte: motivoLimpo.slice(0, 500),
      statusEm: new Date(),
      silenciadoAte: null,
    },
  });

  await registrarAuditoria({
    empresaId: r.sinal.empresaId,
    acao: "ATUALIZAR",
    entidade: "Sinal",
    entidadeId: sinalId,
    resumo: `Sinal "${tipoSinalLabel(r.sinal.tipo)}" (${r.sinal.unidadeNome}) descartado.`,
    detalhes: { motivo: motivoLimpo.slice(0, 500) },
  });

  revalidatePath(`/rh/${empresaIdRota}/sinais`);
  return { ok: true };
}

/**
 * Dono e prazo são escolha MANUAL entre os usuários existentes. Escalonamento
 * automático por papel devolveria vazio em 100% dos casos hoje (nenhum usuário
 * tem papel de gestor de setor e User não tem vínculo com Colaborador) — por
 * isso nem existe aqui.
 */
export async function definirDonoEPrazoSinal(
  empresaIdRota: string,
  sinalId: string,
  donoUserId: string | null,
  prazoInput: string | null,
): Promise<ActionResult> {
  const r = await sinalNoEscopo(empresaIdRota, sinalId);
  if ("erro" in r) return { ok: false, error: r.erro };
  if (!vivo(r.sinal.status) && r.sinal.status !== "SILENCIADO") {
    return { ok: false, error: "Sinal descartado não recebe dono nem prazo." };
  }

  let donoNome: string | null = null;
  if (donoUserId) {
    const dono = await prisma.user.findFirst({
      where: { id: donoUserId, ativo: true },
      select: { nome: true },
    });
    if (!dono) return { ok: false, error: "Usuário não encontrado ou inativo." };
    donoNome = dono.nome;
  }

  const prazo = prazoInput ? dataDoFormulario(prazoInput) : null;
  if (prazoInput && !prazo) return { ok: false, error: "Prazo inválido." };

  await prisma.sinal.update({
    where: { id: sinalId },
    data: { donoUserId, donoNome, prazo },
  });

  await registrarAuditoria({
    empresaId: r.sinal.empresaId,
    acao: "ATUALIZAR",
    entidade: "Sinal",
    entidadeId: sinalId,
    resumo: `Sinal "${tipoSinalLabel(r.sinal.tipo)}" (${r.sinal.unidadeNome}): dono ${donoNome ?? "removido"}, prazo ${prazo ? formatarData(prazo) : "sem prazo"}.`,
  });

  revalidatePath(`/rh/${empresaIdRota}/sinais`);
  return { ok: true };
}

/**
 * "Virar plano de ação" — cria o registro na tela de Planos de Ação que já
 * existe, com título e contexto pré-preenchidos a partir do sinal, e amarra os
 * dois (sinal vira EM_PLANO e guarda o id do plano).
 *
 * Sinal de grupo/marca não tem CNPJ próprio; o plano nasce no CNPJ da ROTA —
 * o plano precisa de uma empresa e a de quem está decidindo é a escolha menos
 * surpreendente. A descrição do plano registra a unidade original.
 */
export async function virarPlanoDeAcaoDoSinal(
  empresaIdRota: string,
  sinalId: string,
): Promise<ActionResult> {
  const r = await sinalNoEscopo(empresaIdRota, sinalId);
  if ("erro" in r) return { ok: false, error: r.erro };
  const { usuario, sinal } = r;
  if (sinal.status === "EM_PLANO") return { ok: false, error: "Este sinal já virou plano de ação." };
  if (sinal.status === "DESCARTADO") return { ok: false, error: "Sinal descartado não vira plano." };

  const empresaDoPlano = sinal.empresaId ?? empresaIdRota;

  // Sinal de setor carrega o setorId na unidade — o plano herda, mas só depois
  // de conferir que o setor pertence mesmo à empresa do plano (o snapshot pode
  // ter envelhecido; setor apagado não pode derrubar a criação).
  let setorId: string | null = null;
  if (sinal.nivelUnidade === "setor") {
    const setor = await prisma.setor.findFirst({
      where: { id: sinal.unidadeId, empresaId: empresaDoPlano },
      select: { id: true },
    });
    setorId = setor?.id ?? null;
  }

  const prazoDefinidoNoCartao = sinal.prazo != null;
  const prazo = sinal.prazo ?? somarDiasUTC(hojeUTC(), PRAZO_PADRAO_PLANO_DIAS);

  const contexto = [
    `Criado da Central de Sinais (${tipoSinalLabel(sinal.tipo)} — ${sinal.unidadeNome}).`,
    `Observado: ${sinal.observado}. Esperado: ${sinal.esperado}.`,
    sinal.recorte ? `Fora do recorte: ${sinal.recorte}` : null,
    prazoDefinidoNoCartao ? null : `Prazo padrão de ${PRAZO_PADRAO_PLANO_DIAS} dias — nenhum prazo foi definido no cartão do sinal.`,
  ]
    .filter(Boolean)
    .join("\n");

  const plano = await prisma.planoAcao.create({
    data: {
      empresaId: empresaDoPlano,
      titulo: sinal.titulo,
      descricao: contexto,
      setorId,
      responsavelId: sinal.donoUserId,
      responsavelNome: sinal.donoNome,
      prazo,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await prisma.sinal.update({
    where: { id: sinalId },
    data: { status: "EM_PLANO", statusEm: new Date(), planoAcaoId: plano.id, silenciadoAte: null },
  });

  await registrarAuditoria({
    empresaId: empresaDoPlano,
    acao: "CRIAR",
    entidade: "PlanoAcao",
    entidadeId: plano.id,
    resumo: `Plano de ação "${plano.titulo}" criado a partir de sinal (${tipoSinalLabel(sinal.tipo)}), prazo ${formatarData(prazo)}.`,
    detalhes: { sinalId },
  });

  revalidatePath(`/rh/${empresaIdRota}/sinais`);
  revalidatePath(`/rh/${empresaDoPlano}/planos-acao`);
  return { ok: true };
}
