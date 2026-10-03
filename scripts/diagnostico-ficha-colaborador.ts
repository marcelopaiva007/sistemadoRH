/**
 * Script de Diagnóstico: Mede o tempo de carregamento da ficha de colaborador
 *
 * Uso:
 *   npx tsx scripts/diagnostico-ficha-colaborador.ts <empresaId> <colaboradorId>
 *
 * Exemplo:
 *   npx tsx scripts/diagnostico-ficha-colaborador.ts "emp-001" "col-001"
 *
 * Resultado: Mostra qual query demora mais e quanto tempo cada uma leva
 */

import { prisma } from "@/lib/prisma";
import { medirPromise, obterRelatorio, formatarRelatorio, limparEventos } from "@/lib/timing-profiler";

const args = process.argv.slice(2);
const empresaId = args[0];
const colaboradorId = args[1];

if (!empresaId || !colaboradorId) {
  console.error("❌ Faltam argumentos!");
  console.error("Uso: npx tsx scripts/diagnostico-ficha-colaborador.ts <empresaId> <colaboradorId>");
  console.error("Ex:  npx tsx scripts/diagnostico-ficha-colaborador.ts 'emp-001' 'col-001'");
  process.exit(1);
}

async function executarDiagnostico() {
  console.log(`\n📊 Iniciando diagnóstico da ficha de colaborador...`);
  console.log(`   Empresa: ${empresaId}`);
  console.log(`   Colaborador: ${colaboradorId}\n`);

  limparEventos();

  try {
    // 1. Buscar colaborador base
    const colaborador = await medirPromise(
      "1. Buscar colaborador (base)",
      prisma.colaborador.findFirst({
        where: { id: colaboradorId, empresaId },
        include: {
          setor: true,
          posicao: true,
          supervisor: { select: { id: true, nome: true } },
          _count: { select: { dependentes: { where: { planoSaude: true } } } },
        },
      })
    );

    if (!colaborador) {
      console.error("❌ Colaborador não encontrado!");
      process.exit(1);
    }

    console.log(`✅ Colaborador encontrado: ${colaborador.nome}`);

    // 2. Buscar escopo de marca
    const escopoMarca = await medirPromise(
      "2. Buscar escopo de marca (empresasDaMesmaMarca)",
      prisma.empresa.findMany({
        where: { marca: { empresas: { some: { id: empresaId } } } },
        select: { id: true },
      })
    );

    const escopoIds = escopoMarca.map((e) => e.id);
    console.log(`   Empresas na mesma marca: ${escopoIds.length}`);

    // 3. Todas as 23 queries em paralelo
    console.log("\n🔄 Executando 23 queries em paralelo...\n");

    const [
      dependentes,
      documentos,
      ferias,
      ausencias,
      requisitos,
      certificados,
      exames,
      setores,
      posicoes,
      candidatosSupervisor,
      movimentacoes,
      beneficios,
      entregasEpi,
      acidentes,
      ausenciasElegiveis,
      checklistDesligamento,
      entrevistaDesligamento,
      avaliacoes,
      metas,
      pdi,
      participacoesTreinamento,
      treinamentosAtivos,
      candidaturaDeOrigem,
    ] = await Promise.all([
      medirPromise("3. Dependentes", prisma.dependente.findMany({ where: { colaboradorId }, orderBy: { nome: "asc" } })),

      medirPromise("4. Documentos", prisma.documentoColaborador.findMany({ where: { colaboradorId }, orderBy: [{ createdAt: "desc" }] })),

      medirPromise("5. Férias", prisma.solicitacaoFerias.findMany({ where: { colaboradorId }, orderBy: [{ dataInicio: "desc" }] })),

      medirPromise("6. Ausências", prisma.ausencia.findMany({ where: { colaboradorId }, orderBy: [{ dataInicio: "desc" }] })),

      medirPromise("7. Requisitos NR", prisma.requisitoNR.findMany({ where: { posicaoId: colaborador.posicaoId }, orderBy: { norma: "asc" } })),

      medirPromise("8. Certificados NR", prisma.certificadoNR.findMany({ where: { colaboradorId }, orderBy: [{ realizadoEm: "desc" }] })),

      medirPromise("9. Exames Ocupacionais", prisma.exameOcupacional.findMany({ where: { colaboradorId }, orderBy: [{ realizadoEm: "desc" }] })),

      medirPromise("10. Setores (catálogo)", prisma.setor.findMany({ where: { empresaId: { in: escopoIds }, ativo: true }, orderBy: { nome: "asc" } })),

      medirPromise("11. Posições (catálogo)", prisma.posicao.findMany({ where: { empresaId: { in: escopoIds }, ativo: true }, orderBy: { nome: "asc" } })),

      medirPromise("12. Candidatos Supervisor", prisma.colaborador.findMany({
        where: { empresaId, ativo: true, id: { not: colaboradorId } },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      })),

      medirPromise("13. Movimentações", prisma.movimentacao.findMany({ where: { colaboradorId }, orderBy: { dataEfetiva: "desc" } })),

      medirPromise("14. Benefícios", prisma.beneficioColaborador.findMany({ where: { colaboradorId }, orderBy: [{ dataFim: "asc" }, { dataInicio: "desc" }] })),

      medirPromise("15. Entregas EPI", prisma.entregaEPI.findMany({ where: { colaboradorId }, orderBy: [{ dataEntrega: "desc" }] })),

      medirPromise("16. Acidentes", prisma.acidente.findMany({ where: { colaboradorId }, orderBy: [{ dataOcorrencia: "desc" }] })),

      medirPromise("17. Ausências Elegiveis", prisma.ausencia.findMany({
        where: { colaboradorId, status: "APROVADA" },
        orderBy: [{ dataInicio: "desc" }],
      })),

      medirPromise("18. Checklist Desligamento", prisma.checklistDesligamento.findMany({
        where: { colaboradorId },
        orderBy: [{ createdAt: "desc" }],
      })),

      medirPromise("19. Entrevista Desligamento", prisma.entrevistaDesligamento.findFirst({
        where: { colaboradorId },
      })),

      medirPromise("20. Avaliações", prisma.avaliacao.findMany({ where: { colaboradorId }, orderBy: { periodo: "desc" } })),

      medirPromise("21. Metas", prisma.meta.findMany({ where: { colaboradorId }, orderBy: { periodo: "desc" } })),

      medirPromise("22. PDI", prisma.pdi.findMany({ where: { colaboradorId }, orderBy: { criadoEm: "desc" } })),

      medirPromise("23. Participações Treinamento", prisma.participacaoTreinamento.findMany({
        where: { colaboradorId },
        orderBy: [{ dataSolicitacao: "desc" }],
      })),

      medirPromise("24. Treinamentos Ativos", prisma.treinamento.findMany({
        where: { ativo: true, empresaId },
        orderBy: { nome: "asc" },
      })),

      medirPromise("25. Candidatura de Origem", prisma.candidaturaRH.findFirst({
        where: { colaboradorId },
      })),
    ]);

    // Exibir relatório
    const relatorio = obterRelatorio();
    const textoFormatado = formatarRelatorio(relatorio);
    console.log(textoFormatado);

    // Análise específica
    console.log("\n📈 ANÁLISE:\n");
    console.log(`✅ Total de queries:  ${relatorio.quantidadeOps}`);
    console.log(`⏱️  Tempo de DB:       ${relatorio.duracao_queries}ms`);
    console.log(`⚙️  Tempo de parse:    ${relatorio.duracao_compute}ms`);
    console.log(`🎯 Tempo total:       ${relatorio.total}ms\n`);

    // Recomendações
    console.log("💡 RECOMENDAÇÕES:\n");

    const maiorQuery = relatorio.operacoes.filter((o) => o.marca === "query").sort((a, b) => b.duracao - a.duracao)[0];

    if (relatorio.duracao_queries > 2000) {
      console.log("⚠️  ATENÇÃO: Queries estão tomando >2s");
      if (maiorQuery) {
        console.log(`   A query mais lenta é: "${maiorQuery.label}" (${maiorQuery.duracao}ms)`);
        console.log("   → Verificar índices de banco de dados");
        console.log("   → Considerar eager-load vs lazy-load");
      }
    }

    if (relatorio.total > 3000) {
      console.log("⚠️  Tempo total >3s — implementar Suspense para streaming");
    }

    if (relatorio.quantidadeOps > 20) {
      console.log("⚠️  Muitas queries em paralelo (>20) — pool de conexões pode estar saturado");
      console.log("   → Considerar agrupar queries relacionadas");
    }

    console.log("\n✅ Diagnóstico concluído.\n");
  } catch (error) {
    console.error("❌ Erro durante diagnóstico:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

executarDiagnostico();
