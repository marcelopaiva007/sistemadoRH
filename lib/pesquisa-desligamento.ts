// P09-OFF — Pesquisa de Desligamento (fase 4, onda 1). Aprovado pelo Marcelo
// em 02/08/2026: campanha única por marca (mesmo padrão de P06-ONB30 —
// lib/pesquisa-onboarding.ts) e gatilho = quando `Colaborador.ativo` vira
// false. O seed pede "dia do aviso" — não existe campo de aviso prévio no
// schema (RD-001 já documenta essa limitação), então o convite sai no
// desligamento efetivo, não no aviso.
//
// Fora do escopo por ora: a pergunta de múltipla escolha com até 3 opções
// (`motivos_multipla_escolha_max3` no seed) — o sistema só suporta 1 opção
// por pergunta de múltipla escolha hoje (RespostaItem.opcaoId é singular);
// dar suporte a "até N escolhas" é mudança de schema, não desta função.
import type { Cliente } from "@/lib/prisma";
import { CATALOGO_PESQUISAS } from "@/lib/pesquisas-catalogo";
import crypto from "node:crypto";

export const MODELO_DESLIGAMENTO = "P09-OFF";

type ItemSeed = { n: number; texto: string; escala?: string };

function perguntasDoSeed(): { enunciado: string; tipo: string }[] {
  const def = CATALOGO_PESQUISAS[MODELO_DESLIGAMENTO];
  const raw = def.raw as { itens: ItemSeed[] };
  return raw.itens.map((item) => ({
    enunciado: item.texto,
    tipo: item.escala === "NPS11" ? "NPS_10" : item.escala === "ABERTA" ? "TEXT" : "LIKERT_5",
  }));
}

/** Acha a campanha ACTIVE da marca ou cria (com as perguntas do catálogo) na primeira vez. */
async function garantirCampanha(cliente: Cliente, marcaId: string, empresaId: string): Promise<string> {
  const existente = await cliente.pesquisa.findFirst({
    where: { marcaId, modelo: MODELO_DESLIGAMENTO, status: "ACTIVE" },
    select: { id: true },
  });
  if (existente) return existente.id;

  const def = CATALOGO_PESQUISAS[MODELO_DESLIGAMENTO];
  const pesquisa = await cliente.pesquisa.create({
    data: {
      marcaId,
      empresaId,
      titulo: "Pesquisa de Desligamento",
      descricao: "Enviada após o desligamento. Suas respostas ajudam a empresa a melhorar — respondendo ou não, isso não afeta nada da sua rescisão.",
      modelo: MODELO_DESLIGAMENTO,
      anonima: def.anonima,
      status: "ACTIVE",
    },
  });

  let ordem = 0;
  for (const p of perguntasDoSeed()) {
    await cliente.pergunta.create({
      data: {
        pesquisaId: pesquisa.id,
        ordem: ordem++,
        enunciado: p.enunciado,
        tipo: p.tipo,
        obrigatoria: p.tipo !== "TEXT",
      },
    });
  }

  return pesquisa.id;
}

/**
 * Chamar sempre que um colaborador for marcado desligado (ativo: true →
 * false) — mesmo evento que `invalidarConvitesDeDesligados`
 * (lib/pesquisa-vinculo.ts). Idempotente: reprocessar a mesma pessoa não
 * duplica o convite nem reseta um já respondido.
 */
export async function convidarParaPesquisaDesligamento(
  cliente: Cliente,
  colaboradorId: string,
  empresaId: string,
  marcaId: string,
): Promise<void> {
  const pesquisaId = await garantirCampanha(cliente, marcaId, empresaId);
  await cliente.surveyToken.upsert({
    where: { pesquisaId_colaboradorId: { pesquisaId, colaboradorId } },
    create: { pesquisaId, colaboradorId, token: crypto.randomBytes(24).toString("base64url") },
    update: {},
  });
}
