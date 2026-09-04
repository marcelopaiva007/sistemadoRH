// Materializa em rh.MarcacaoTratada os pedidos de INCLUSAO_MANUAL que ja
// estavam APROVADOS antes de v1.166.0 — quando aprovar so mudava o status do
// TratamentoPonto e nenhuma marcacao nascia. Sem isto, o monitor de presenca,
// o AEJ e o portal continuam cegos para marcacoes que o RH ja autorizou.
//
// NUNCA grava em RegistroPonto: aquela tabela e o que o REP-P coletou e e a
// unica fonte do AFD (Portaria MTP 671/2021). Marcacao incluida por decisao do
// RH e jornada TRATADA — vai para o AEJ, painel e apuracao, nunca para o AFD,
// e nao consome NSR.
//
// Uso:
//   npx tsx scripts/materializar-tratamentos-aprovados.ts             DRY-RUN (so lista)
//   npx tsx scripts/materializar-tratamentos-aprovados.ts --executar  grava
//
// Idempotente: MarcacaoTratada.tratamentoId e UNIQUE, entao rodar duas vezes
// nao duplica — a segunda rodada relata "ja tinham" e nao cria nada. Falha
// numa linha nao aborta as demais; o resumo no fim diz o que aconteceu.
// DATABASE_URL vem do ambiente (.env), como nos outros scripts desta pasta.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { dataHoraDoFormularioBrasilia, formatarData, paraInputDate } from "@/lib/datas";
import { gerarHashMarcacaoTratadaSHA256 } from "@/lib/ponto-seguranca";
import { TIPOS_MARCACAO_VALIDOS } from "@/lib/constants-ponto";

const EXECUTAR = process.argv.includes("--executar");
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Quem assina a trilha e o script, nao um usuario. O `ator` explicito faz
// registrarAuditoria NAO chamar auth() — fora do Next nao existe sessao.
const ATOR_SCRIPT = {
  id: "script:materializar-tratamentos-aprovados",
  nome: "Backfill de marcacoes tratadas",
  papel: "SCRIPT",
};

/** "DD/MM" de um INSTANTE, no dia de Brasilia (nao do processo, que e UTC na Vercel). */
function diaMesBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

/** "DD/MM HH:mm" de um instante em Brasilia, para a listagem. */
function horaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function carregarAprovados() {
  // Traz TODOS os aprovados de INCLUSAO_MANUAL (com e sem marcacao ja criada):
  // o relatorio precisa dizer quantos ja tinham, quantos nao dao para converter
  // e quantos serao criados. Sao poucas dezenas de linhas — classificar em
  // memoria e mais simples e mais legivel do que quatro consultas.
  return prisma.tratamentoPonto.findMany({
    where: { status: "APROVADO", tipo: "INCLUSAO_MANUAL" },
    select: {
      id: true,
      empresaId: true,
      colaboradorId: true,
      dataFato: true,
      tipoMarcacao: true,
      horaSolicitada: true,
      motivo: true,
      origem: true,
      aprovadoPorId: true,
      aprovadoPorNome: true,
      aprovadoEm: true,
      updatedAt: true,
      colaborador: { select: { nome: true, empresa: { select: { nome: true } } } },
      marcacao: { select: { id: true, origemRegistro: true } },
    },
    orderBy: [{ empresaId: "asc" }, { dataFato: "asc" }],
  });
}

type Linha = Awaited<ReturnType<typeof carregarAprovados>>[number];

/**
 * A receita de data/hora do contrato. `dataFato` e gravada como meia-noite UTC
 * (data de calendario), entao o DIA sai de paraInputDate, que le em UTC —
 * diaBrasilia(dataFato) devolveria o dia ANTERIOR (21:00 da vespera em
 * Brasilia). A hora e a declarada pela pessoa ("HH:mm", horario de Brasilia),
 * e a juncao e a mesma funcao que interpreta um <input datetime-local> como
 * Brasilia. Ex.: 2026-09-03T00:00Z + "18:00" -> 2026-09-03T21:00:00Z.
 */
function instanteDaMarcacao(l: Linha): Date | null {
  if (!l.horaSolicitada || !HORA_RE.test(l.horaSolicitada)) return null;
  const dia = paraInputDate(l.dataFato);
  return dataHoraDoFormularioBrasilia(`${dia}T${l.horaSolicitada}`);
}

function resumoDaLinha(l: Linha) {
  return {
    id: l.id,
    empresa: l.colaborador.empresa.nome,
    colaborador: l.colaborador.nome,
    dia: formatarData(l.dataFato),
    marcacao: l.tipoMarcacao ?? "—",
    hora: l.horaSolicitada ?? "—",
    origem: l.origem,
  };
}

async function main() {
  console.log(EXECUTAR ? "MODO: EXECUTAR (vai gravar)" : "MODO: DRY-RUN (so lista; use --executar para gravar)");

  const linhas = await carregarAprovados();
  const jaTinham = linhas.filter((l) => l.marcacao !== null);
  const semMarcacao = linhas.filter((l) => l.marcacao === null);
  const semDados = semMarcacao.filter((l) => !l.tipoMarcacao || !l.horaSolicitada);

  const invalidos: { linha: Linha; problema: string }[] = [];
  const convertiveis: { linha: Linha; tipo: string; dataHora: Date }[] = [];
  for (const l of semMarcacao) {
    if (!l.tipoMarcacao || !l.horaSolicitada) continue; // ja contado em semDados
    if (!TIPOS_MARCACAO_VALIDOS.has(l.tipoMarcacao)) {
      invalidos.push({ linha: l, problema: `tipoMarcacao desconhecido: ${l.tipoMarcacao}` });
      continue;
    }
    const dataHora = instanteDaMarcacao(l);
    if (!dataHora) {
      invalidos.push({ linha: l, problema: `horaSolicitada fora de HH:mm: ${l.horaSolicitada}` });
      continue;
    }
    convertiveis.push({ linha: l, tipo: l.tipoMarcacao, dataHora });
  }

  console.log(`\nAprovados de INCLUSAO_MANUAL no banco: ${linhas.length}`);
  console.log(`  ja tinham MarcacaoTratada: ${jaTinham.length}`);
  console.log(`  sem marcacao/hora (nao convertiveis): ${semDados.length}`);
  console.log(`  com dados invalidos: ${invalidos.length}`);
  console.log(`  convertiveis: ${convertiveis.length}`);

  if (semDados.length > 0) {
    console.log("\nSEM marcacao/hora — abertos pelo RH antes do formulario pedir os dois. Nao ha o que");
    console.log("materializar: o RH precisa reabrir cada um informando qual marcacao e o horario.");
    console.table(semDados.map(resumoDaLinha));
  }
  if (invalidos.length > 0) {
    console.log("\nDADOS INVALIDOS — conferir a mao:");
    console.table(invalidos.map((i) => ({ ...resumoDaLinha(i.linha), problema: i.problema })));
  }
  if (convertiveis.length > 0) {
    console.log(EXECUTAR ? "\nSERAO CRIADAS:" : "\nSERIAM CRIADAS (dry-run):");
    console.table(
      convertiveis.map((c) => ({
        ...resumoDaLinha(c.linha),
        instanteUTC: c.dataHora.toISOString(),
        emBrasilia: horaBrasilia(c.dataHora),
        aprovadoPor: c.linha.aprovadoPorNome ?? "—",
      })),
    );
  }

  if (!EXECUTAR) {
    console.log("\nNada foi gravado. Rode com --executar para materializar.");
    return;
  }

  const backfillAntes = await prisma.marcacaoTratada.count({ where: { origemRegistro: "BACKFILL" } });
  const agora = new Date();
  let criadas = 0;
  let corridas = 0;
  let falhas = 0;

  for (const c of convertiveis) {
    const l = c.linha;
    // Linhas antigas podem ter aprovadoEm nulo (o status mudou sem carimbo);
    // MarcacaoTratada.aprovadoEm e obrigatorio, entao cai no updatedAt — o
    // instante em que o status virou APROVADO, na pratica.
    const aprovadoEm = l.aprovadoEm ?? l.updatedAt;
    const hashSHA256 = gerarHashMarcacaoTratadaSHA256({
      tratamentoId: l.id,
      colaboradorId: l.colaboradorId,
      empresaId: l.empresaId,
      dataHoraISO: c.dataHora.toISOString(),
      tipo: c.tipo,
      aprovadoPorId: l.aprovadoPorId,
    });

    try {
      const marcacao = await prisma.marcacaoTratada.create({
        data: {
          empresaId: l.empresaId,
          colaboradorId: l.colaboradorId,
          tratamentoId: l.id,
          dataHora: c.dataHora,
          tipo: c.tipo,
          justificativa: l.motivo,
          aprovadoPorId: l.aprovadoPorId,
          aprovadoPorNome: l.aprovadoPorNome,
          aprovadoEm,
          hashSHA256,
          origemRegistro: "BACKFILL",
        },
        select: { id: true },
      });
      criadas++;

      await registrarAuditoria({
        empresaId: l.empresaId,
        acao: "CRIAR",
        entidade: "MarcacaoTratada",
        entidadeId: marcacao.id,
        resumo: `Decisao de ${diaMesBrasilia(aprovadoEm)} materializada em ${diaMesBrasilia(agora)} (backfill)`,
        detalhes: {
          tratamentoId: l.id,
          colaboradorId: l.colaboradorId,
          colaborador: l.colaborador.nome,
          tipo: c.tipo,
          dataHora: c.dataHora.toISOString(),
          aprovadoPorNome: l.aprovadoPorNome,
          origemRegistro: "BACKFILL",
        },
        ator: ATOR_SCRIPT,
      });

      console.log(`  ✓ ${l.colaborador.nome} — ${c.tipo} em ${horaBrasilia(c.dataHora)} (tratamento ${l.id})`);
    } catch (e) {
      // Unique de tratamentoId: alguem (ou uma rodada paralela) criou entre a
      // leitura e a escrita. Nao e erro — e exatamente o que o unique protege.
      const codigo = (e as { code?: string } | null)?.code;
      if (codigo === "P2002") {
        corridas++;
        console.log(`  · ${l.colaborador.nome} — ja tinha marcacao (tratamento ${l.id})`);
        continue;
      }
      falhas++;
      console.error(`  ✗ ${l.colaborador.nome} — tratamento ${l.id}:`, e instanceof Error ? e.message : e);
    }
  }

  // Confirmacao pelo banco, nao pelo contador em memoria.
  const backfillDepois = await prisma.marcacaoTratada.count({ where: { origemRegistro: "BACKFILL" } });
  const aindaSemMarcacao = await prisma.tratamentoPonto.count({
    where: {
      status: "APROVADO",
      tipo: "INCLUSAO_MANUAL",
      tipoMarcacao: { not: null },
      horaSolicitada: { not: null },
      marcacao: { is: null },
    },
  });

  console.log("\nRESUMO");
  console.log(`  aprovados de INCLUSAO_MANUAL: ${linhas.length}`);
  console.log(`  ja tinham marcacao antes desta rodada: ${jaTinham.length}`);
  console.log(`  sem marcacao/hora (RH precisa reabrir): ${semDados.length}`);
  console.log(`  dados invalidos: ${invalidos.length}`);
  console.log(`  criadas nesta rodada: ${criadas} (unique impediu: ${corridas}, falharam: ${falhas})`);
  console.log(`  BACKFILL no banco: ${backfillAntes} antes -> ${backfillDepois} depois (delta ${backfillDepois - backfillAntes})`);
  console.log(`  aprovados convertiveis ainda sem marcacao: ${aindaSemMarcacao}`);

  if (backfillDepois - backfillAntes !== criadas) {
    console.warn("  ! delta do banco difere do contador — outra rodada em paralelo ou linha BACKFILL apagada; conferir.");
  }
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Falha geral:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
