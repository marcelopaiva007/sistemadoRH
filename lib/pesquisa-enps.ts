// P05-ENPS — Termômetro mensal (fase 4 do roadmap de 02/08/2026, onda 1 do
// seed: P05, P01, P06, P09 — P05 primeiro por não ter nenhuma dependência
// além do catálogo).
//
// Espelha o padrão de lib/pesquisa-ciclo.ts (candidatos → rascunho em DRAFT
// → RH aprova → notifica) mas escopado só a este tipo. Generalizar pra
// qualquer tipo do catálogo (uma função só, dirigida por
// lib/pesquisas-catalogo.ts) é trabalho da fase 5 — só compensa quando
// houver mais de 1-2 tipos rodando ao mesmo tempo; hoje, com CLIMA/NR01/P05,
// seria engenharia prematura.
import { prisma, type Cliente } from "@/lib/prisma";
import { CATALOGO_PESQUISAS } from "@/lib/pesquisas-catalogo";
import { notificarCiclo } from "@/lib/pesquisa-notificacoes";

const MODELO = "P05-ENPS";

type ItemSeed = { n: number; texto: string; escala?: string };

function perguntasDoSeed(): { enunciado: string; tipo: string }[] {
  const def = CATALOGO_PESQUISAS[MODELO];
  const raw = def.raw as { itens: ItemSeed[] };
  return raw.itens.map((item) => ({
    enunciado: item.texto,
    // NPS11 -> pergunta 0-10 (mesmo tipo já usado pelo pulso de Clima);
    // ABERTA -> texto livre; sem outro caso no P05 hoje.
    tipo: item.escala === "NPS11" ? "NPS_10" : "TEXT",
  }));
}

export type CandidatoEnps = { marcaId: string; marcaNome: string; empresaId: string; empresaNome: string };

/** Uma marca precisa de novo pulso se ainda não tem P05-ENPS criado neste mês-calendário. */
export async function coletarCandidatosEnps(
  cliente: Cliente = prisma,
  agora: Date = new Date(),
): Promise<CandidatoEnps[]> {
  const marcas = await cliente.marca.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, empresas: { where: { ativo: true }, select: { id: true, nome: true } } },
  });

  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const candidatos: CandidatoEnps[] = [];

  for (const marca of marcas) {
    // Mesma convenção do ciclo de Clima: marca sem CNPJ ativo não tem a quem aplicar.
    const empresa = marca.empresas[0];
    if (!empresa) continue;

    const jaTemEsteMes = await cliente.pesquisa.findFirst({
      where: { marcaId: marca.id, modelo: MODELO, createdAt: { gte: inicioDoMes } },
      select: { id: true },
    });
    if (jaTemEsteMes) continue;

    candidatos.push({ marcaId: marca.id, marcaNome: marca.nome, empresaId: empresa.id, empresaNome: empresa.nome });
  }

  return candidatos;
}

/**
 * Cria o pulso em DRAFT — RH aprova antes de sair, mesmo padrão do ciclo de
 * Clima. Só abre transação própria quando chamado com o client top-level
 * (cron/produção); recebendo um `tx` de fora (smoke test em rollback), grava
 * direto nele — Prisma não permite transação aninhada.
 */
export async function criarPulsoEnps(
  cand: CandidatoEnps,
  agora: Date = new Date(),
  cliente: Cliente = prisma,
): Promise<{ pesquisaId: string; titulo: string }> {
  const mesAno = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const titulo = `eNPS — ${mesAno}`;
  const def = CATALOGO_PESQUISAS[MODELO];

  const gravar = async (tx: Cliente) => {
    const pesquisa = await tx.pesquisa.create({
      data: {
        marcaId: cand.marcaId,
        empresaId: cand.empresaId,
        titulo,
        descricao: "Termômetro mensal — 1 pergunta de recomendação (0 a 10) + 2 abertas. Leva menos de 1 minuto.",
        modelo: MODELO,
        anonima: def.anonima,
        status: "DRAFT",
      },
    });

    let ordem = 0;
    for (const p of perguntasDoSeed()) {
      await tx.pergunta.create({
        data: {
          pesquisaId: pesquisa.id,
          ordem: ordem++,
          enunciado: p.enunciado,
          tipo: p.tipo,
          dimensaoGPTW: "GERAL",
          // Só a nota (NPS_10) é obrigatória — as duas abertas são opcionais,
          // igual ao "o que motivou a nota?" do próprio seed.
          obrigatoria: p.tipo === "NPS_10",
        },
      });
    }

    return { pesquisaId: pesquisa.id, titulo };
  };

  return cliente === prisma ? await prisma.$transaction(gravar) : await gravar(cliente);
}

export type ResultadoCicloEnps = {
  criados: { empresaId: string; pesquisaId: string; titulo: string }[];
  erros: string[];
};

/** Ponto de entrada do cron: cria o rascunho do mês em cada marca que ainda não tem um. */
export async function executarCicloEnps(agora: Date = new Date()): Promise<ResultadoCicloEnps> {
  const candidatos = await coletarCandidatosEnps(prisma, agora);
  const criados: ResultadoCicloEnps["criados"] = [];
  const erros: string[] = [];

  for (const cand of candidatos) {
    try {
      const { pesquisaId, titulo } = await criarPulsoEnps(cand, agora);
      criados.push({ empresaId: cand.empresaId, pesquisaId, titulo });
      await notificarCiclo({ empresaId: cand.empresaId, pesquisaId, titulo, tipo: "CRIADA" });
    } catch (e) {
      erros.push(`criar eNPS ${cand.empresaNome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { criados, erros };
}
