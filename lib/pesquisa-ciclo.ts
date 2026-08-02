// Gerenciamento de ciclo de pesquisas de clima: cria ciclo anual/pulso em DRAFT
// para aprovação, encerra pesquisas com prazo vencido, ativa pesquisas com início agendado.

import { prisma } from "@/lib/prisma";
import { TEMPLATE_CLIMA_COMPLETO, TEMPLATE_CLIMA_PULSO } from "@/lib/pesquisa-templates";
import { notificarCiclo } from "@/lib/pesquisa-notificacoes";

type DimensaoGPTW = "CREDIBILIDADE" | "RESPEITO" | "IMPARCIALIDADE" | "ORGULHO" | "CAMARADAGEM" | "GERAL";

export type TipoCiclo = "ANUAL" | "PULSO";

// O ciclo é por MARCA. Antes era por CNPJ, e o cron criava um rascunho para
// cada empresa: a LM Telecom, com cinco CNPJs, ganhava cinco "Pulso de Clima"
// idênticos a cada trimestre. `empresaId` continua aqui só para registrar em
// qual empresa da marca a pesquisa nasce.
export type CicloCandidato = {
  marcaId: string;
  marcaNome: string;
  empresaId: string;
  empresaNome: string;
  tipo: TipoCiclo;
  ano: number;
  trimestre?: number;
  pesquisaAnteriorId?: string | null;
};

export type ResultadoGestaoCiclo = {
  criados: Array<{ empresaId: string; pesquisaId: string; tipo: TipoCiclo; titulo: string }>;
  encerrados: Array<{ pesquisaId: string; titulo: string; motivo: string }>;
  ativados: Array<{ pesquisaId: string; titulo: string }>;
  jaNotificados: string[];
  erros: string[];
};

// Trimestre atual (1-4)
export function trimestreAtual(data: Date = new Date()): number {
  return Math.floor(data.getMonth() / 3) + 1;
}

// Decide se precisa criar ciclo para uma empresa
export function precisaCriarCiclo(
  pesquisas: { modelo?: string | null; status: string; createdAt: Date }[],
  tipo: TipoCiclo,
  agora: Date = new Date(),
): boolean {
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const triAtual = trimestreAtual(agora);

  // JANEIRO (mês 0) → cria ciclo anual
  if (tipo === "ANUAL" && mes !== 0) return false;
  // Primeira semana de cada trimestre (meses 0, 3, 6, 9) → cria pulso
  if (tipo === "PULSO") {
    const mesesPulso = [0, 3, 6, 9];
    if (!mesesPulso.includes(mes)) return false;
  }

  // Verifica se já existe ciclo deste tipo criado para o período
  if (tipo === "ANUAL") {
    return !pesquisas.some(
      (p) => p.modelo === "CLIMA" && p.createdAt.getFullYear() === ano,
    );
  }
  // PULSO
  return !pesquisas.some((p) => {
    if (p.modelo !== "CLIMA") return false;
    const c = p.createdAt;
    return (
      c.getFullYear() === ano && Math.floor(c.getMonth() / 3) + 1 === triAtual
    );
  });
}

// Coleta candidatos para criação de ciclo — uma pesquisa por MARCA, não por
// CNPJ. A pesquisa de clima é do grupo: rodar uma por empresa multiplicava o
// mesmo questionário e obrigava o RH a consolidar cinco resultados à mão.
export async function coletarCandidatos(): Promise<CicloCandidato[]> {
  const marcas = await prisma.marca.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, empresas: { where: { ativo: true }, select: { id: true, nome: true } } },
  });

  const candidatos: CicloCandidato[] = [];
  const agora = new Date();
  const ano = agora.getFullYear();
  const tri = trimestreAtual(agora);

  for (const marca of marcas) {
    // Marca sem CNPJ ativo não tem a quem aplicar pesquisa.
    const empresa = marca.empresas[0];
    if (!empresa) continue;
    const e = { id: empresa.id, nome: empresa.nome, marcaId: marca.id, marcaNome: marca.nome };

    const pesquisas = await prisma.pesquisa.findMany({
      where: { marcaId: marca.id, modelo: "CLIMA" },
      select: { id: true, titulo: true, status: true, createdAt: true },
    });

    // Se tem pesquisa ACTIVE não sugere nova (mantém a atual)
    const temAtiva = pesquisas.some((p) => p.status === "ACTIVE");
    if (temAtiva) continue;

    // ANUAL
    if (precisaCriarCiclo(pesquisas, "ANUAL", agora)) {
      const anterior = [...pesquisas].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      candidatos.push({
        marcaId: e.marcaId,
        marcaNome: e.marcaNome,
        empresaId: e.id,
        empresaNome: e.nome,
        tipo: "ANUAL",
        ano,
        pesquisaAnteriorId: anterior?.id ?? null,
      });
    }

    // PULSO
    if (precisaCriarCiclo(pesquisas, "PULSO", agora)) {
      candidatos.push({
        marcaId: e.marcaId,
        marcaNome: e.marcaNome,
        empresaId: e.id,
        empresaNome: e.nome,
        tipo: "PULSO",
        ano,
        trimestre: tri,
      });
    }
  }

  return candidatos;
}

// Cria pesquisa em DRAFT (nunca em ACTIVE) — RH precisa aprovar
export async function criarCicloRascunho(cand: CicloCandidato): Promise<{ pesquisaId: string; titulo: string }> {
  const titulo =
    cand.tipo === "ANUAL"
      ? `Pesquisa de Clima Organizacional ${cand.ano}`
      : `Pulso de Clima ${cand.ano} T${cand.trimestre}`;

  const descricao =
    cand.tipo === "ANUAL"
      ? "Avaliação anual anônima do clima organizacional. Modelo GPTW (Great Place to Work): 5 dimensões, 20 perguntas Likert 1-5 + NPS. Sua opinião honesta é valiosa e nos ajuda a melhorar."
      : "Pulso trimestral — versão reduzida com 1 pergunta-síntese por dimensão + NPS. Resposta em ~1 minuto. Use para acompanhar a tendência entre ciclos anuais.";

  const perguntas =
    cand.tipo === "ANUAL"
      ? TEMPLATE_CLIMA_COMPLETO.flatMap((d) =>
          d.enunciados.map((enunciado) => ({ dimensao: d.dimensao as DimensaoGPTW, enunciado })),
        )
      : TEMPLATE_CLIMA_PULSO.flatMap((d) =>
          d.enunciados.map((enunciado) => ({ dimensao: d.dimensao as DimensaoGPTW, enunciado })),
        );

  return await prisma.$transaction(async (tx) => {
    const pesquisa = await tx.pesquisa.create({
      data: {
        marcaId: cand.marcaId,
        empresaId: cand.empresaId,
        titulo,
        descricao,
        modelo: "CLIMA",
        // "tipo" não é coluna — vai no título. Marcamos PULSO no título.
        anonima: true,
        status: "DRAFT",
      },
    });

    let ordem = 0;
    for (const p of perguntas) {
      await tx.pergunta.create({
        data: {
          pesquisaId: pesquisa.id,
          ordem: ordem++,
          enunciado: p.enunciado,
          tipo: "LIKERT_5",
          dimensaoGPTW: p.dimensao as any,
          obrigatoria: true,
        },
      });
    }

    await tx.pergunta.create({
      data: {
        pesquisaId: pesquisa.id,
        ordem: ordem++,
        enunciado:
          "Qual é a probabilidade de você recomendar a empresa como um bom lugar para trabalhar? (0 = não recomenda, 10 = recomenda fortemente)",
        tipo: "NPS_10",
        dimensaoGPTW: "GERAL",
        obrigatoria: true,
      },
    });

    return { pesquisaId: pesquisa.id, titulo };
  });
}

// Encerra pesquisas ACTIVE cujo prazo venceu (campo descritivo ou convenção)
// Por convenção: ACTIVE há mais de 30 dias e sem respostas há 7 dias
//
// Desde que CLIMA migrou pra régua de cobrança (lib/regua-cobranca.ts, fecha
// no dia 15), esta função fica de fato inerte: nenhuma pesquisa CLIMA chega
// mais aos 30 dias ainda ACTIVE. Mantida — é barata e inofensiva — em vez de
// removida, pra não arrastar mudança no tipo de retorno de
// `executarGestaoCiclo`/`ResumoGestaoCiclo` só por limpeza.
export async function encerrarVencidas(): Promise<Array<{ pesquisaId: string; titulo: string; motivo: string }>> {
  const limiteAtiva = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 dias
  const limiteResposta = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 dias

  const candidates = await prisma.pesquisa.findMany({
    where: {
      modelo: "CLIMA",
      status: "ACTIVE",
      iniciadaEm: { lt: limiteAtiva },
    },
    include: {
      _count: { select: { respostas: true } },
    },
  });

  const resultados: Array<{ pesquisaId: string; titulo: string; motivo: string }> = [];

  for (const p of candidates) {
    // Só encerra se não tem resposta recente (últimos 7 dias)
    const ultimaResposta = await prisma.resposta.findFirst({
      where: { pesquisaId: p.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const podeEncerrar =
      !ultimaResposta || ultimaResposta.createdAt < limiteResposta;

    if (podeEncerrar) {
      await prisma.pesquisa.update({
        where: { id: p.id },
        data: { status: "FINISHED", encerradaEm: new Date() },
      });
      resultados.push({
        pesquisaId: p.id,
        titulo: p.titulo,
        motivo: !ultimaResposta
          ? "Sem respostas; ativa há mais de 30 dias"
          : "Sem respostas há mais de 7 dias; ativa há mais de 30 dias",
      });
    }
  }

  return resultados;
}

// Ativa pesquisas DRAFT cujo início é hoje (campo iniciarEm=null = imediato)
export async function ativarAgendadas(): Promise<Array<{ pesquisaId: string; titulo: string }>> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const candidates = await prisma.pesquisa.findMany({
    where: {
      status: "DRAFT",
      // Se não tem iniciadoEm agendado, fica em DRAFT até alguém clicar
      // Aqui só ativamos as explicitamente agendadas (campo iniciarEm < hoje)
    },
  });

  // Como o modelo não tem campo "agendarInicio", esta função fica como
  // placeholder — RH ativa manualmente. Mantida para evolução futura.
  return [];
}

// Os quatro passos do ciclo, na ordem em que o cron os executa. Extraído para
// cá para ter um único dono: a rota de cron (app/api/cron/gestao-ciclo-pesquisas)
// e o botão manual da tela de Pesquisas (lib/actions/pesquisas.ts) chamam a
// mesma função — sem isso, o botão manual reimplementaria a orquestração por
// conta própria e as duas versões divergiriam na primeira mudança.
//
// A janela automática do PULSO é só nos meses 1/4/7/10 (ver
// `precisaCriarCiclo`): uma marca sem CNPJ ativo em todo o trimestre, ou
// criada fora da janela, fica sem Pulso até o próximo trimestre — a menos que
// alguém rode isto manualmente. É esse o caso que o botão cobre.
export async function executarGestaoCiclo(): Promise<ResultadoGestaoCiclo> {
  const resultado: ResultadoGestaoCiclo = {
    criados: [],
    encerrados: [],
    ativados: [],
    jaNotificados: [],
    erros: [],
  };

  const candidatos = await coletarCandidatos();

  for (const cand of candidatos) {
    try {
      const { pesquisaId, titulo } = await criarCicloRascunho(cand);
      resultado.criados.push({ empresaId: cand.empresaId, pesquisaId, tipo: cand.tipo, titulo });

      await notificarCiclo({
        empresaId: cand.empresaId,
        pesquisaId,
        titulo,
        tipo: "CRIADA",
      });
    } catch (e) {
      resultado.erros.push(
        `criar ${cand.empresaNome} ${cand.tipo}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  resultado.encerrados = await encerrarVencidas();

  for (const enc of resultado.encerrados) {
    try {
      const pesquisa = await prisma.pesquisa.findUnique({
        where: { id: enc.pesquisaId },
        select: { empresaId: true },
      });
      if (pesquisa) {
        await notificarCiclo({
          empresaId: pesquisa.empresaId,
          pesquisaId: enc.pesquisaId,
          titulo: enc.titulo,
          tipo: "ENCERRADA",
        });
      }
    } catch (e) {
      resultado.erros.push(
        `notificar encerramento ${enc.titulo}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  resultado.ativados = await ativarAgendadas();

  return resultado;
}
