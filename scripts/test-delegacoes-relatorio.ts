// A prova do Relatório da Direção (lib/delegacoes/relatorio.ts): qual período
// é aceito, e a serialização do Painel para CSV — sem banco, sem servidor.
//
//   npx tsx scripts/test-delegacoes-relatorio.ts

import { janelaValida, linhasParaCsv } from "../lib/delegacoes/relatorio";
import type { LinhaPainel, Painel } from "../lib/delegacoes/painel-entregas";

let falhas = 0;
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

console.log("\nJanela — só os valores oferecidos na tela, nunca um número arbitrário\n");
{
  igual(janelaValida("7"), 7, "7 é aceito");
  igual(janelaValida("30"), 30, "30 é aceito");
  igual(janelaValida("90"), 90, "90 é aceito");
  igual(janelaValida("365"), 30, "365 não é uma janela oferecida — cai no padrão");
  igual(janelaValida("abacaxi"), 30, "texto não numérico cai no padrão");
  igual(janelaValida(undefined), 30, "ausente cai no padrão");
  igual(janelaValida(""), 30, "vazio cai no padrão");
}

function linha(over: Partial<LinhaPainel>): LinhaPainel {
  return {
    nome: "Ana",
    abertas: 0,
    atrasadas: 0,
    entregues: 0,
    noPrazo: 0,
    devolucoes: 0,
    repactuadas: 0,
    horasMediaEntrega: null,
    horasSomadas: 0,
    horasEstimadasMedia: null,
    comEstimativa: 0,
    dentroEstimativa: 0,
    ...over,
  };
}

console.log("\nCSV — mesmas colunas da tela, uma linha por pessoa mais os totais\n");
{
  const painel: Painel = {
    linhas: [
      linha({ nome: "Ana", abertas: 2, atrasadas: 1, entregues: 3, noPrazo: 2, horasMediaEntrega: 24, horasEstimadasMedia: 20, comEstimativa: 3, dentroEstimativa: 2 }),
      linha({ nome: "Bruno", abertas: 1, entregues: 1, noPrazo: 1 }),
    ],
    totais: linha({ nome: "Todos", abertas: 3, atrasadas: 1, entregues: 4, noPrazo: 3, horasMediaEntrega: 20 }),
  };
  const { colunas, linhas } = linhasParaCsv(painel);
  igual(colunas.length, 9, "nove colunas — as mesmas da tabela na tela");
  igual(linhas.length, 3, "duas pessoas mais a linha de totais (mais de uma pessoa)");
  igual(linhas[0][0], "Ana", "primeira linha é a primeira pessoa do painel");
  igual(linhas[2][0], "Todos", "última linha é o total, quando há mais de uma pessoa");
}

console.log("\nCSV — uma pessoa só não repete a linha de totais (mesma regra da tela)\n");
{
  const painel: Painel = {
    linhas: [linha({ nome: "Solo" })],
    totais: linha({ nome: "Todos" }),
  };
  const { linhas } = linhasParaCsv(painel);
  igual(linhas.length, 1, "sem linha de totais quando só há uma pessoa");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
