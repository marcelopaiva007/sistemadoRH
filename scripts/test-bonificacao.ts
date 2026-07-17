/**
 * Teste standalone do motor de bonificação — valida os casos da OS §5.
 * Rode com: npx tsx scripts/test-bonificacao.ts
 *
 * Usa apenas funções puras (lib/bonificacao-calc.ts) — não toca no banco.
 */
import {
  calcularBonificacaoIndividual,
  calcularBonificacaoSupervisor,
  type LancamentoAgregado,
} from "../lib/bonificacao-calc";
import { REGRAS_DEFAULT } from "../lib/regras-defaults";

function agregado(over: Partial<LancamentoAgregado>): LancamentoAgregado {
  return {
    quantidade: 0,
    aprovado: 0,
    cancelado: 0,
    valorInstalado: 0,
    valorDemaisServicos: 0,
    qtdInternet: 0,
    qtdChip: 0,
    qtdGps: 0,
    qtdTv: 0,
    qtdStreaming: 0,
    qtdTelefoniaFixa: 0,
    ...over,
  };
}

let falhas = 0;
function check(nome: string, obtido: number, esperado: number) {
  const ok = Math.abs(obtido - esperado) < 1e-6;
  if (!ok) falhas++;
  console.log(`${ok ? "✅" : "❌"} ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

const vend = REGRAS_DEFAULT.VENDEDOR_EXTERNO;
const sup = REGRAS_DEFAULT.SUPERVISOR;
const adm = REGRAS_DEFAULT.ATENDIMENTO_ADM;

// Vendedor externo — internet (3 faixas, valor aplicado a todas as vendas)
check("Vendedor internet 25", calcularBonificacaoIndividual(agregado({ qtdInternet: 25 }), vend).valorInternet, 250);
check("Vendedor internet 40", calcularBonificacaoIndividual(agregado({ qtdInternet: 40 }), vend).valorInternet, 800);
check("Vendedor internet 19", calcularBonificacaoIndividual(agregado({ qtdInternet: 19 }), vend).valorInternet, 0);
check("Vendedor internet 30", calcularBonificacaoIndividual(agregado({ qtdInternet: 30 }), vend).valorInternet, 450);

// Vendedor externo — chip (meta 15)
check("Vendedor chip 15", calcularBonificacaoIndividual(agregado({ qtdChip: 15 }), vend).valorChip, 75);
check("Vendedor chip 14", calcularBonificacaoIndividual(agregado({ qtdChip: 14 }), vend).valorChip, 0);

// Vendedor externo — TV (R$5/venda, sem meta) entra em "demais"
check("Vendedor TV 3", calcularBonificacaoIndividual(agregado({ qtdTv: 3 }), vend).valorDemais, 15);

// Supervisor — como vendedor (22 internet → faixa 1)
check("Supervisor próprio 22 internet", calcularBonificacaoIndividual(agregado({ qtdInternet: 22 }), sup).valorInternet, 220);
// Supervisor — bônus de equipe (130 internet, equipe de 5 → faixa 1, R$2/venda)
check("Supervisor equipe 130 (t=5)", calcularBonificacaoSupervisor(sup.supervisor, 130, 5).valor, 260);
// Abaixo da meta da equipe (99 < 100) → 0
check("Supervisor equipe 99 (t=5)", calcularBonificacaoSupervisor(sup.supervisor, 99, 5).valor, 0);
// Faixa 2 (150-199 → R$3): 160 × 3 = 480
check("Supervisor equipe 160 (t=5)", calcularBonificacaoSupervisor(sup.supervisor, 160, 5).valor, 480);

// Atendimento/ADM — internet R$20/venda
check("ADM internet 10", calcularBonificacaoIndividual(agregado({ qtdInternet: 10 }), adm).valorInternet, 200);
// Atendimento/ADM — demais serviços = 50% do valor (TV de R$150)
check("ADM demais 50% de 150", calcularBonificacaoIndividual(agregado({ valorDemaisServicos: 150 }), adm).valorDemais, 75);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
