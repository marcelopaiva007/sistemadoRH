// Produtividade da equipe de RH — tela em Auditoria (não confundir com a
// trilha de auditoria em si, que é sobre CONFORMIDADE/LGPD; esta é sobre
// GESTÃO da equipe). Dois sinais, nenhum dos dois sozinho:
//
//   * ATIVIDADE: quantas ações a pessoa fez no sistema por dia, e entre que
//     horários — vem da trilha de auditoria (lib/audit.ts), que já registra
//     TODA ação de qualquer tela. Não é "trabalhou", é "mexeu no sistema":
//     reunião, ligação e papelada não aparecem aqui. Tratar isto como prova
//     de ausência é o erro que o comentário abaixo de `resumoProdutividade`
//     existe para evitar.
//   * PRODUÇÃO: quantos itens a pessoa decidiu (aprovou/reprovou) — férias,
//     ausência, documento de colaborador. Mesma trilha, filtrada por ação.
//
// Escopo por MARCA (lib/escopo-marca.ts), não por CNPJ isolado: um RH_MANAGER
// costuma responder por mais de um CNPJ da mesma marca, e a trilha (aba
// "Trilha" da mesma tela) fica de propósito por CNPJ — telas diferentes,
// perguntas diferentes.
import { prisma, type Cliente } from "@/lib/prisma";
import { diaBrasilia } from "@/lib/datas";
import type { LinhaProdutividadeDia, ResumoProdutividadePessoa } from "@/lib/produtividade-rh-utils";

export type { LinhaProdutividadeDia, ResumoProdutividadePessoa } from "@/lib/produtividade-rh-utils";

/**
 * Detalhe dia a dia: uma linha por (pessoa, dia) com atividade — dia sem
 * nenhuma ação simplesmente não aparece aqui (aparece no resumo, como 0).
 */
export async function produtividadePorDia(
  empresaIds: string[],
  de: Date,
  ate: Date,
  cliente?: Cliente,
): Promise<LinhaProdutividadeDia[]> {
  if (empresaIds.length === 0) return [];
  const db = cliente ?? (await import("@/lib/prisma")).prisma;

  const registros = await db.auditLog.findMany({
    where: { empresaId: { in: empresaIds }, createdAt: { gte: de, lte: ate }, usuarioId: { not: null } },
    select: { usuarioId: true, usuarioNome: true, usuarioRole: true, acao: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const baldes = new Map<string, LinhaProdutividadeDia>();
  for (const r of registros) {
    if (!r.usuarioId) continue;
    const dia = diaBrasilia(r.createdAt);
    const chave = `${r.usuarioId}:${dia}`;
    let linha = baldes.get(chave);
    if (!linha) {
      linha = {
        usuarioId: r.usuarioId,
        usuarioNome: r.usuarioNome ?? "—",
        usuarioRole: r.usuarioRole,
        dia,
        totalAcoes: 0,
        primeiraAcao: r.createdAt,
        ultimaAcao: r.createdAt,
        aprovados: 0,
        reprovados: 0,
      };
      baldes.set(chave, linha);
    }
    linha.totalAcoes++;
    if (r.createdAt < linha.primeiraAcao) linha.primeiraAcao = r.createdAt;
    if (r.createdAt > linha.ultimaAcao) linha.ultimaAcao = r.createdAt;
    if (r.acao === "APROVAR") linha.aprovados++;
    if (r.acao === "REPROVAR") linha.reprovados++;
  }

  return [...baldes.values()].sort(
    (a, b) => b.dia.localeCompare(a.dia) || a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR"),
  );
}

/**
 * Resumo por pessoa na janela inteira — inclui quem está vinculado à marca
 * (RH_MANAGER/GESTOR_SETOR) MESMO SEM NENHUMA ação: zero atividade é
 * exatamente o sinal que esta tela existe para mostrar, e omitir a linha
 * esconderia o caso mais importante. Alguém que agiu sem estar no vínculo
 * (ex.: ADMIN colocando a mão na massa) também entra — a trilha não mente
 * sobre quem agiu, só o vínculo formal é que pode estar incompleto.
 */
export async function resumoProdutividade(
  empresaIds: string[],
  de: Date,
  ate: Date,
  cliente?: Cliente,
): Promise<ResumoProdutividadePessoa[]> {
  if (empresaIds.length === 0) return [];
  const db = cliente ?? (await import("@/lib/prisma")).prisma;

  const [linhas, vinculos] = await Promise.all([
    produtividadePorDia(empresaIds, de, ate, db),
    db.userEmpresa.findMany({
      where: { empresaId: { in: empresaIds }, role: { in: ["RH_MANAGER", "GESTOR_SETOR"] }, ativo: true },
      select: { user: { select: { id: true, nome: true, role: true, ativo: true } } },
    }),
  ]);

  const baldes = new Map<string, ResumoProdutividadePessoa>();
  for (const v of vinculos) {
    if (!v.user.ativo) continue;
    if (!baldes.has(v.user.id)) {
      baldes.set(v.user.id, {
        usuarioId: v.user.id,
        usuarioNome: v.user.nome,
        usuarioRole: v.user.role,
        diasComAtividade: 0,
        totalAcoes: 0,
        aprovados: 0,
        reprovados: 0,
      });
    }
  }

  for (const l of linhas) {
    let r = baldes.get(l.usuarioId);
    if (!r) {
      r = {
        usuarioId: l.usuarioId,
        usuarioNome: l.usuarioNome,
        usuarioRole: l.usuarioRole,
        diasComAtividade: 0,
        totalAcoes: 0,
        aprovados: 0,
        reprovados: 0,
      };
      baldes.set(l.usuarioId, r);
    }
    r.diasComAtividade++;
    r.totalAcoes += l.totalAcoes;
    r.aprovados += l.aprovados;
    r.reprovados += l.reprovados;
  }

  return [...baldes.values()].sort(
    (a, b) => b.totalAcoes - a.totalAcoes || a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR"),
  );
}
