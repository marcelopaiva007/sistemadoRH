/**
 * Script de Diagnóstico: Mede o tempo de carregamento do Painel de BI
 *
 * Uso:
 *   npx tsx scripts/diagnostico-painel-bi.ts <empresaId>
 *
 * Exemplo:
 *   npx tsx scripts/diagnostico-painel-bi.ts "emp-001"
 */

import { prisma } from "@/lib/prisma";
import { medirPromise, obterRelatorio, formatarRelatorio, limparEventos } from "@/lib/timing-profiler";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  distribuicaoFaixaEtaria,
  headcountMensal,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { analisarDesligamentos } from "@/lib/anomalias";
import { medirMalhaLideranca } from "@/lib/lideranca";
import { montarNarrativa } from "@/lib/narrativa";

const args = process.argv.slice(2);
const empresaId = args[0];

if (!empresaId) {
  console.error("❌ Faltam argumentos!");
  console.error("Uso: npx tsx scripts/diagnostico-painel-bi.ts <empresaId>");
  console.error("Ex:  npx tsx scripts/diagnostico-painel-bi.ts 'emp-001'");
  process.exit(1);
}

async function executarDiagnostico() {
  console.log(`\n📊 Iniciando diagnóstico do Painel de BI...`);
  console.log(`   Empresa: ${empresaId}\n`);

  limparEventos();

  try {
    // Simulando dados de escopo
    const escopo = [empresaId];
    const janela = 12;
    const hoje = new Date();

    console.log("🔄 Executando queries base do Painel...\n");

    // Queries que sempre rodam
    const [empresas, vinculos, ativos, setores, ausenciasRecentes, ausenciasNoEscopo, beneficiosVigentes] =
      await Promise.all([
        medirPromise("1. Buscar empresas", prisma.empresa.findMany({
          where: { id: { in: escopo }, ativo: true },
          select: { id: true, nome: true, marca: { select: { id: true, nome: true } } },
        })),

        medirPromise("2. Buscar colaboradores (vinculos)", prisma.colaborador.findMany({
          where: { empresaId: { in: escopo } },
          select: {
            id: true,
            nome: true,
            ativo: true,
            empresaId: true,
            dataAdmissao: true,
            dataDesligamento: true,
            setor: { select: { nome: true } },
            posicao: { select: { nome: true } },
          },
        })),

        medirPromise("3. Buscar colaboradores ativos", prisma.colaborador.findMany({
          where: { empresaId: { in: escopo }, ativo: true },
          select: {
            salarioBase: true,
            dataAdmissao: true,
            dataNascimento: true,
            setorId: true,
            setor: { select: { nome: true } },
          },
        })),

        medirPromise("4. Buscar setores", prisma.setor.findMany({
          where: { empresaId: { in: escopo } },
          select: { id: true, nome: true },
        })),

        medirPromise("5. Buscar ausências recentes", prisma.ausencia.findMany({
          where: { colaborador: { empresaId: { in: escopo } }, dataFim: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        })),

        medirPromise("6. Buscar ausências no escopo", prisma.ausencia.findMany({
          where: { colaborador: { empresaId: { in: escopo } } },
        })),

        medirPromise("7. Buscar benefícios vigentes", prisma.beneficioColaborador.findMany({
          where: { colaborador: { empresaId: { in: escopo } }, dataFim: null },
        })),
      ]);

    console.log(`✅ Queries base concluídas\n`);

    // Computações que rodam DEPOIS dos dados
    console.log("⚙️  Executando computações BI...\n");

    const resultados = await Promise.all([
      medirPromise("8. Cálculo: Headcount Mensal", Promise.resolve(headcountMensal(vinculos, janela))),

      medirPromise("9. Cálculo: Headcount por Setor", Promise.resolve(headcountPorSetor(ativos))),

      medirPromise("10. Cálculo: Turnover", Promise.resolve(calcularTurnover(vinculos, janela))),

      medirPromise("11. Cálculo: Custo Pessoal por Setor", Promise.resolve(custoPessoalPorSetor(ativos))),

      medirPromise("12. Cálculo: Movimentação Mensal", Promise.resolve(movimentoMensal(vinculos, janela))),

      medirPromise("13. Cálculo: Distribuição Faixa Etária", Promise.resolve(distribuicaoFaixaEtaria(ativos))),

      medirPromise("14. Cálculo: Absenteísmo por Setor", Promise.resolve(absenteismoPorSetor(ausenciasNoEscopo, setores))),

      medirPromise("15. Análise: Desligamentos (anomalias)", Promise.resolve(analisarDesligamentos(vinculos, janela))),

      medirPromise("16. Cálculo: Malha de Liderança", Promise.resolve(medirMalhaLideranca(ativos))),

      medirPromise("17. Narrativa: Resumo do Mês", Promise.resolve(montarNarrativa(vinculos, ativos, janela))),
    ]);

    console.log(`✅ Computações concluídas\n`);

    // Relatório
    const relatorio = obterRelatorio();
    const textoFormatado = formatarRelatorio(relatorio);
    console.log(textoFormatado);

    // Análise
    console.log("\n📈 ANÁLISE:\n");

    const queryTime = relatorio.duracao_queries;
    const computeTime = relatorio.duracao_compute;

    console.log(`✅ Queries de banco:   ${queryTime}ms (${((queryTime / relatorio.total) * 100).toFixed(1)}%)`);
    console.log(`⚙️  Computações:        ${computeTime}ms (${((computeTime / relatorio.total) * 100).toFixed(1)}%)`);
    console.log(`🎯 Tempo total:        ${relatorio.total}ms\n`);

    // Recomendações
    console.log("💡 RECOMENDAÇÕES:\n");

    if (queryTime > 1500) {
      console.log("⚠️  Queries estão lentas (>1.5s)");
      console.log("   → Verificar índices do PostgreSQL");
      console.log("   → Considerar eager-loading vs lazy-loading\n");
    }

    if (computeTime > 1000) {
      console.log("⚠️  Computações estão pesadas (>1s)");
      console.log("   → Usar dynamic() com ssr:false para gráficos");
      console.log("   → Implementar Suspense para carregar após viewport\n");
    }

    if (relatorio.total > 2500) {
      console.log("⚠️  Tempo total >2.5s");
      console.log("   → Implementar streaming com Suspense");
      console.log("   → KPIs carregam primeiro, gráficos depois\n");
    }

    console.log("✅ Diagnóstico concluído.\n");
  } catch (error) {
    console.error("❌ Erro durante diagnóstico:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

executarDiagnostico();
