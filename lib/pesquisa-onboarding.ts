// P06-ONB30 — Onboarding D+30 (fase 4, onda 1 do seed). Primeira pesquisa
// "por_evento" (dispara 30 dias após admissão, não numa janela de calendário
// como CLIMA/eNPS) — precisa de campanha permanente por marca em vez de uma
// pesquisa nova a cada ciclo: uma única Pesquisa ACTIVE por marca acumula um
// SurveyToken por pessoa conforme completa 30 dias, igual ao padrão já
// combinado para P09 (desligamento, ainda não implementado).
//
// Depois de criado o SurveyToken (PENDING), TODO o resto já funciona sem
// código novo: `rodadaEnvioAutomatico` (lib/convites.ts) envia qualquer
// pesquisa ACTIVE com pendentes, `lembrete-pesquisa` cobra quem não
// respondeu, `responderPesquisa` aceita a resposta, os dashboards genéricos
// leem o resultado — nenhum desses é específico de CLIMA/NR01, então uma
// pesquisa nova só precisa criar a campanha e os tokens.
import { prisma, type Cliente } from "@/lib/prisma";
import { CATALOGO_PESQUISAS } from "@/lib/pesquisas-catalogo";
import { idsComAfastamentoVigente } from "@/lib/pesquisa-vinculo";
import crypto from "node:crypto";

const MODELO = "P06-ONB30";
const DIAS_GATILHO = 30;

type ItemSeed = { n: number; texto: string; escala?: string };

function perguntasDoSeed(): { enunciado: string; tipo: string }[] {
  const def = CATALOGO_PESQUISAS[MODELO];
  const raw = def.raw as { itens: ItemSeed[] };
  return raw.itens.map((item) => ({
    enunciado: item.texto,
    // Sem `escala` no item = usa a escala_padrao do tipo (LIK5_CONC ->
    // Likert); NPS11 -> nota 0-10; ABERTA -> texto livre.
    tipo: item.escala === "NPS11" ? "NPS_10" : item.escala === "ABERTA" ? "TEXT" : "LIKERT_5",
  }));
}

/** Acha a campanha ACTIVE da marca ou cria (com as perguntas do catálogo) na primeira vez. */
async function garantirCampanha(cliente: Cliente, marcaId: string, empresaId: string): Promise<string> {
  const existente = await cliente.pesquisa.findFirst({
    where: { marcaId, modelo: MODELO, status: "ACTIVE" },
    select: { id: true },
  });
  if (existente) return existente.id;

  const def = CATALOGO_PESQUISAS[MODELO];
  const pesquisa = await cliente.pesquisa.create({
    data: {
      marcaId,
      empresaId,
      titulo: "Onboarding — 30 dias",
      descricao: "Enviada automaticamente 30 dias após a admissão. Não é anônima: a liderança usa a resposta pra ajustar o processo de integração.",
      modelo: MODELO,
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

export type ResultadoCicloOnboarding = {
  convidados: { empresaId: string; marcaId: string; colaboradorNome: string }[];
  erros: string[];
};

/**
 * Roda 1×/dia: para cada colaborador que completou exatamente 30 dias de
 * empresa hoje (bucket de 1 dia — quem passar batido num dia com o cron
 * fora do ar não recebe depois; aceitável para uma pesquisa de onboarding,
 * não vale o custo de variar isso agora), garante a campanha da marca e
 * cria o convite. Igual ao resto do fluxo de convites, `skipDuplicates` /
 * unique [pesquisaId, colaboradorId] tornam isto seguro de rodar de novo.
 */
export async function executarCicloOnboarding(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
): Promise<ResultadoCicloOnboarding> {
  const inicioDoDia = new Date(hoje);
  inicioDoDia.setHours(0, 0, 0, 0);
  const dataAlvoInicio = new Date(inicioDoDia.getTime() - DIAS_GATILHO * 24 * 60 * 60 * 1000);
  const dataAlvoFim = new Date(dataAlvoInicio.getTime() + 24 * 60 * 60 * 1000);

  const candidatos = await cliente.colaborador.findMany({
    where: { ativo: true, dataAdmissao: { gte: dataAlvoInicio, lt: dataAlvoFim } },
    select: { id: true, nome: true, empresaId: true, empresa: { select: { marcaId: true, nome: true } } },
  });

  const afastados = await idsComAfastamentoVigente(cliente, candidatos.map((c) => c.id), hoje);
  const elegiveis = candidatos.filter((c) => !afastados.has(c.id));

  const convidados: ResultadoCicloOnboarding["convidados"] = [];
  const erros: string[] = [];

  // Campanha é por marca — agrupa antes de criar, pra não checar/criar a
  // mesma Pesquisa uma vez por pessoa quando duas admissões da mesma marca
  // batem 30 dias no mesmo dia.
  const porMarca = new Map<string, { empresaId: string; colaboradores: typeof elegiveis }>();
  for (const c of elegiveis) {
    const marcaId = c.empresa.marcaId;
    const grupo = porMarca.get(marcaId);
    if (grupo) grupo.colaboradores.push(c);
    else porMarca.set(marcaId, { empresaId: c.empresaId, colaboradores: [c] });
  }

  for (const [marcaId, grupo] of porMarca) {
    try {
      const pesquisaId = await garantirCampanha(cliente, marcaId, grupo.empresaId);
      for (const colaborador of grupo.colaboradores) {
        await cliente.surveyToken.upsert({
          where: { pesquisaId_colaboradorId: { pesquisaId, colaboradorId: colaborador.id } },
          create: { pesquisaId, colaboradorId: colaborador.id, token: crypto.randomBytes(24).toString("base64url") },
          // Já existia (reprocessamento do mesmo dia) — não recria nem reseta status.
          update: {},
        });
        convidados.push({ empresaId: grupo.empresaId, marcaId, colaboradorNome: colaborador.nome });
      }
    } catch (e) {
      erros.push(`onboarding marca ${marcaId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { convidados, erros };
}
