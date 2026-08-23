"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { sincronizarPendencias } from "@/lib/processos/pendencias";
import type { ActionResult } from "@/lib/constants";

// A Central de Pendências — as três coisas que se faz com uma pendência:
// assumir (dar dono), dispensar (com motivo) e mandar reprocessar.
//
// Resolver NÃO está aqui, e é de propósito: pendência se resolve resolvendo o
// que a originou. Indicou o condutor, renovou o licenciamento — o detector para
// de encontrar e a linha se fecha sozinha. Um botão "marcar como resolvida"
// transformaria a lista numa lista de coisas que alguém DISSE que resolveu, que
// é exatamente o que ela existe para não ser.

/**
 * Dá dono a uma pendência — ou troca o dono.
 *
 * `tornarPadrao` grava também a REGRA: toda pendência FUTURA do mesmo tipo já
 * nasce com este dono. É o caminho de escrita da decisão do CEO de 23/08/2026
 * (frota → operações, contratos → financeiro): sem ele, a configuração de dono
 * padrão existia no banco mas nenhuma tela escrevia nela — e o bloco "sem
 * responsável" seria o estado permanente do painel.
 */
export async function definirResponsavel(input: {
  empresaId: string;
  pendenciaId: string;
  responsavelId: string;
  substitutoId?: string | null;
  tornarPadrao?: boolean;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const pendencia = await prisma.pendencia.findFirst({
    where: { id: input.pendenciaId, empresaId: { in: visiveis } },
    select: { id: true, titulo: true, tipo: true },
  });
  if (!pendencia) return { ok: false, error: "Pendência não encontrada no seu acesso." };

  // Os ids vêm do cliente. Só usuário ATIVO vira dono: apontar para quem já saiu
  // da empresa é o mesmo que não ter dono, com a agravante de parecer que tem.
  const [responsavel, substituto] = await Promise.all([
    prisma.user.findFirst({ where: { id: input.responsavelId, ativo: true }, select: { id: true, nome: true, username: true } }),
    input.substitutoId
      ? prisma.user.findFirst({ where: { id: input.substitutoId, ativo: true }, select: { id: true, nome: true, username: true } })
      : Promise.resolve(null),
  ]);
  if (!responsavel) return { ok: false, error: "Escolha um responsável ativo." };

  await prisma.pendencia.update({
    where: { id: pendencia.id },
    data: {
      responsavelId: responsavel.id,
      responsavelNome: responsavel.nome,
      substitutoId: substituto?.id ?? null,
      substitutoNome: substituto ? substituto.nome : null,
      estado: "EM_ANDAMENTO",
    },
  });

  if (input.tornarPadrao) {
    // Regra do GRUPO (empresaId nulo): quem cuida de multas cuida das multas
    // de todos os CNPJs — é assim que os domínios foram distribuídos. Um CNPJ
    // com dono próprio para um tipo é exceção que se cria à parte.
    // Não é upsert: a chave composta (tipo, empresaId) tem empresaId nulo na
    // regra de grupo, e nulo não entra em chave única do Postgres (NULL não é
    // igual a NULL). Busca e grava em dois passos — o cron é o único outro
    // escritor e não toca nestes campos, então a corrida aqui é teórica.
    const regra = await prisma.regraAlerta.findFirst({
      where: { tipo: pendencia.tipo, empresaId: null },
      select: { id: true },
    });
    if (regra) {
      await prisma.regraAlerta.update({
        where: { id: regra.id },
        data: { responsavelPadraoUserId: responsavel.id, responsavelPadraoNome: responsavel.nome },
      });
    } else {
      await prisma.regraAlerta.create({
        data: {
          tipo: pendencia.tipo,
          diasAntecedencia: "30,7,2",
          responsavelPadraoUserId: responsavel.id,
          responsavelPadraoNome: responsavel.nome,
        },
      });
    }
    // As pendências ABERTAS do mesmo tipo que ainda não têm dono herdam agora:
    // "tornar padrão" que só valesse para as futuras deixaria as atuais
    // órfãs, uma a uma.
    await prisma.pendencia.updateMany({
      where: {
        tipo: pendencia.tipo,
        empresaId: { in: visiveis },
        responsavelId: null,
        estado: { in: ["ABERTA", "EM_ANDAMENTO"] },
      },
      data: { responsavelId: responsavel.id, responsavelNome: responsavel.nome },
    });
  }

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "VINCULAR",
    entidade: "Pendencia",
    entidadeId: pendencia.id,
    resumo: input.tornarPadrao
      ? `Definiu ${responsavel.nome} como responsável padrão por pendências de ${pendencia.tipo}`
      : `Definiu ${responsavel.nome} como responsável por "${pendencia.titulo}"`,
  });

  revalidatePath(`/processos/${input.empresaId}`);
  return { ok: true };
}

/**
 * Tira a pendência da lista — com motivo escrito, sempre.
 *
 * Sem essa saída, um alarme falso fica eterno e a pessoa para de confiar na
 * lista INTEIRA, não só naquele item. E sem exigir o motivo, dispensar vira o
 * jeito rápido de esvaziar a tela — o que dá no mesmo.
 */
export async function dispensarPendencia(input: {
  empresaId: string;
  pendenciaId: string;
  motivo: string;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const motivo = (input.motivo ?? "").trim();
  if (motivo.length < 10) {
    return { ok: false, error: "Escreva o motivo — pelo menos uma frase que explique por que isto não se aplica." };
  }

  const pendencia = await prisma.pendencia.findFirst({
    where: { id: input.pendenciaId, empresaId: input.empresaId },
    select: { id: true, titulo: true },
  });
  if (!pendencia) return { ok: false, error: "Pendência não encontrada no seu acesso." };

  await prisma.pendencia.update({
    where: { id: pendencia.id },
    data: {
      estado: "DISPENSADA",
      dispensadaMotivo: motivo.slice(0, 500),
      resolvidaPorId: usuario.id,
      resolvidaPorNome: usuario.name ?? usuario.username,
      resolvidaEm: new Date(),
    },
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "CANCELAR",
    entidade: "Pendencia",
    entidadeId: pendencia.id,
    resumo: `Dispensou "${pendencia.titulo}"`,
    detalhes: { motivo },
  });

  revalidatePath(`/processos/${input.empresaId}`);
  return { ok: true };
}

/**
 * Roda os detectores agora, sem esperar o cron.
 *
 * Existe porque quem acabou de cadastrar dez veículos quer ver a lista na hora
 * — e porque "espere até amanhã" é como um painel novo perde o usuário na
 * primeira sessão.
 */
export async function sincronizarAgora(input: { empresaId: string }): Promise<
  ActionResult & { criadas?: number; atualizadas?: number; resolvidas?: number }
> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  // Roda para tudo que a pessoa alcança, e não só para o CNPJ do caminho: a
  // Central é consolidada por padrão, igual ao resto do sistema.
  const visiveis = await empresasVisiveis(usuario);
  const resultado = await sincronizarPendencias(visiveis);
  revalidatePath(`/processos/${input.empresaId}`);
  return { ok: true, ...resultado };
}
