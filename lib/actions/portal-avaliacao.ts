"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";
import { COMPETENCIAS, tipoAvaliadorLabel } from "@/lib/constants-avaliacao";
import type { ActionResult } from "@/lib/constants";

// Resposta da avaliação de desempenho pelo próprio avaliador, no portal.
//
// Mesma regra do resto do portal: quem está respondendo sai da sessão, nunca do
// formulário. Aqui isso pesa mais do que no cadastro — é a linha que diz quem
// pode preenchê-la (`avaliadorId`), então aceitar um id de fora deixaria
// qualquer colaborador responder a avaliação de outro, inclusive a que o gestor
// faz sobre ele. O id da avaliação vem do cliente, mas só é aceito se o
// avaliador daquela linha for a pessoa da sessão.

/**
 * O gerente inclui alguém na própria lista de avaliados.
 *
 * Existe porque o organograma não serve para isso: `supervisorId` diz a quem a
 * pessoa reporta, e aqui quem avalia é o gerente — em três empresas o
 * organograma está vazio e ninguém entraria no ciclo. Quem pode incluir é só
 * quem o RH marcou como gerente.
 *
 * A pessoa incluída pode ser de outra empresa do grupo: a chefia aqui cruza CNPJ
 * (um gerente da BR SISTEMAS responde por gente da LM SISTEMAS), e barrar isso
 * deixaria de fora justamente quem já é avaliado hoje. A avaliação nasce no
 * ciclo da empresa DA PESSOA AVALIADA — é o RH dela que acompanha o ciclo.
 *
 * Incluir alguém cria duas linhas: a avaliação do gerente e, se ainda não
 * existir, a autoavaliação da pessoa — entrar no ciclo é ser avaliado e também
 * se avaliar.
 */
export async function adicionarPessoaParaAvaliar(
  colaboradorId: string,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };
  if (!sessao.verificado) return { ok: false, error: "Confirme seu CPF antes de montar sua equipe." };

  const gerente = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, empresaId: true, gerente: true },
  });
  if (!gerente) return { ok: false, error: "Cadastro não encontrado. Procure o RH." };
  if (!gerente.gerente) {
    return { ok: false, error: "Só quem está marcado como gerente pode incluir pessoas. Fale com o RH." };
  }
  if (colaboradorId === gerente.id) {
    return { ok: false, error: "Sua autoavaliação já está na lista — não dá para se incluir como equipe." };
  }

  const alvo = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, ativo: true },
    select: { id: true, nome: true, empresaId: true, empresa: { select: { nome: true } } },
  });
  if (!alvo) return { ok: false, error: "Essa pessoa não está ativa no cadastro." };

  const ciclo = await prisma.cicloAvaliacao.findFirst({
    where: { empresaId: alvo.empresaId, encerrado: false },
    orderBy: { dataInicio: "desc" },
    select: { id: true, nome: true },
  });
  if (!ciclo) {
    return {
      ok: false,
      error: `Não há ciclo de avaliação aberto na ${alvo.empresa.nome}. Fale com o RH.`,
    };
  }

  const jaExiste = await prisma.avaliacaoDesempenho.findUnique({
    where: {
      colaboradorId_cicloId_avaliadorId: {
        colaboradorId: alvo.id,
        cicloId: ciclo.id,
        avaliadorId: gerente.id,
      },
    },
    select: { id: true },
  });
  if (jaExiste) return { ok: false, error: `${alvo.nome} já está na sua lista.` };

  await prisma.$transaction(async (tx) => {
    await tx.avaliacaoDesempenho.create({
      data: {
        empresaId: alvo.empresaId,
        colaboradorId: alvo.id,
        cicloId: ciclo.id,
        tipoAvaliador: "GESTOR",
        avaliadorId: gerente.id,
        avaliadorNome: gerente.nome,
      },
    });
    const temAuto = await tx.avaliacaoDesempenho.findUnique({
      where: {
        colaboradorId_cicloId_avaliadorId: {
          colaboradorId: alvo.id,
          cicloId: ciclo.id,
          avaliadorId: alvo.id,
        },
      },
      select: { id: true },
    });
    if (!temAuto) {
      await tx.avaliacaoDesempenho.create({
        data: {
          empresaId: alvo.empresaId,
          colaboradorId: alvo.id,
          cicloId: ciclo.id,
          tipoAvaliador: "AUTOAVALIACAO",
          avaliadorId: alvo.id,
          avaliadorNome: alvo.nome,
        },
      });
    }
  });

  await registrarAuditoria({
    empresaId: alvo.empresaId,
    acao: "CRIAR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: alvo.id,
    resumo: `${gerente.nome} incluiu ${alvo.nome} na própria equipe de avaliação do ciclo "${ciclo.nome}", pelo portal.`,
    ator: { id: gerente.id, nome: gerente.nome, papel: "COLABORADOR" },
  });

  revalidatePath("/portal");
  revalidatePath(`/rh/${alvo.empresaId}/avaliacoes/${ciclo.id}`);
  return { ok: true };
}

export async function salvarMinhaAvaliacao(
  avaliacaoId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };
  // Antes da confirmação de CPF a sessão só serve para confirmar CPF: um link
  // interceptado no chat não pode virar avaliação em nome de ninguém.
  if (!sessao.verificado) {
    return { ok: false, error: "Confirme seu CPF antes de responder a avaliação." };
  }

  const avaliacao = await prisma.avaliacaoDesempenho.findFirst({
    where: { id: avaliacaoId, avaliadorId: sessao.colaboradorId },
    select: {
      id: true,
      empresaId: true,
      cicloId: true,
      colaboradorId: true,
      tipoAvaliador: true,
      ciclo: { select: { nome: true, encerrado: true } },
      colaborador: { select: { nome: true } },
    },
  });
  if (!avaliacao) return { ok: false, error: "Esta avaliação não está na sua lista." };
  if (avaliacao.ciclo.encerrado) {
    return { ok: false, error: "Este ciclo foi encerrado e não aceita mais respostas. Fale com o RH." };
  }

  const avaliador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true },
  });
  if (!avaliador) return { ok: false, error: "Cadastro não encontrado. Procure o RH." };

  const notas: { competencia: string; nota: number }[] = [];
  for (const c of COMPETENCIAS) {
    const bruto = String(formData.get(`nota_${c.value}`) ?? "").trim();
    if (!bruto) return { ok: false, error: `Falta a nota de "${c.label}".` };
    const nota = Number.parseInt(bruto, 10);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return { ok: false, error: `A nota de "${c.label}" deve ser de 1 a 5.` };
    }
    notas.push({ competencia: c.value, nota });
  }

  const notaFinal = notas.reduce((soma, n) => soma + n.nota, 0) / notas.length;

  // Potencial é insumo de nine-box, leitura de gestor sobre a equipe. Ninguém
  // atribui potencial a si mesmo nem ao próprio chefe.
  const potencialBruto = String(formData.get("potencial") ?? "");
  const potencial =
    avaliacao.tipoAvaliador === "GESTOR" && ["BAIXO", "MEDIO", "ALTO"].includes(potencialBruto)
      ? potencialBruto
      : null;

  const texto = (campo: string, max = 2000) =>
    String(formData.get(campo) ?? "").trim().slice(0, max) || null;

  await prisma.$transaction(async (tx) => {
    await tx.notaCompetencia.deleteMany({ where: { avaliacaoId: avaliacao.id } });
    await tx.notaCompetencia.createMany({
      data: notas.map((n) => ({ avaliacaoId: avaliacao.id, competencia: n.competencia, nota: n.nota })),
    });
    await tx.avaliacaoDesempenho.update({
      where: { id: avaliacao.id },
      data: {
        notaFinal,
        potencial,
        pontosFortes: texto("pontosFortes"),
        pontosDesenvolvimento: texto("pontosDesenvolvimento"),
        comentarios: texto("comentarios"),
        status: "CONCLUIDA",
        concluidaEm: new Date(),
      },
    });
  });

  await registrarAuditoria({
    empresaId: avaliacao.empresaId,
    acao: "ATUALIZAR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: avaliacao.id,
    // Como no preenchimento interno: a trilha registra que respondeu e a nota,
    // não o texto dos comentários.
    resumo: `${avaliador.nome} respondeu pelo portal a avaliação de ${avaliacao.colaborador.nome} (${tipoAvaliadorLabel(avaliacao.tipoAvaliador)}) no ciclo "${avaliacao.ciclo.nome}" — nota ${notaFinal.toFixed(1)}.`,
    ator: { id: avaliador.id, nome: avaliador.nome, papel: "COLABORADOR" },
  });

  revalidatePath("/portal");
  revalidatePath(`/rh/${avaliacao.empresaId}/avaliacoes/${avaliacao.cicloId}`);
  return { ok: true };
}
