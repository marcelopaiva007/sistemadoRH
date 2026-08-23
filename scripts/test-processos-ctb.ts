// As regras do CTB que o módulo Processos & Ativos aplica — a conta que erra
// CALADA quando erra.
//
// Um prazo somado errado não dá erro em lugar nenhum. Aparece meses depois, na
// forma de uma multa que triplicou porque o sistema disse "ainda dá tempo"
// quando não dava — ou de um colaborador acusado de estar perto da suspensão
// com pontos que a lei não lhe atribui. Por isso cada regra de
// lib/processos/ctb.ts tem um caso aqui, com o artigo ao lado.
//
// Sem banco de propósito: são funções puras, rodam em qualquer lugar.
//
//   npx tsx scripts/test-processos-ctb.ts

import {
  DIAS_COMUNICACAO_VENDA,
  DIAS_NOVO_CRV,
  ARTIGOS_SEM_PONTUACAO,
  limiteDePontos,
  notificacaoFicta,
  prazoIndicacao,
  normalizarPlaca,
  placaValida,
  formatarPlaca,
  travaLicenciamento,
  TIPOS_DOCUMENTO_VEICULO,
} from "../lib/processos/ctb";
import { severidadeDe } from "../lib/processos/pendencias";
import { dataUTC, diferencaEmDiasUTC } from "../lib/datas";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = recebido === esperado;
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${String(esperado)}`);
    console.log(`     recebido: ${String(recebido)}`);
    falhas++;
  }
}

console.log("\nIndicação de condutor — CTB, art. 257, §7º (30 dias da notificação)\n");
{
  const expedicao = dataUTC(2026, 3, 1);
  const semSne = notificacaoFicta(expedicao, false);
  igual(diferencaEmDiasUTC(semSne, expedicao), 0, "fora do SNE, a notificação vale na data de expedição");
  igual(
    diferencaEmDiasUTC(prazoIndicacao(semSne), expedicao),
    30,
    "o prazo de indicar é 30 dias depois da notificação",
  );
}

console.log("\nA ficção do SNE — CTB, art. 282-A, §2º (notificado 30 dias após a inclusão)\n");
{
  const inclusao = dataUTC(2026, 3, 1);
  const ficta = notificacaoFicta(inclusao, true);
  igual(diferencaEmDiasUTC(ficta, inclusao), 30, "no SNE, a notificação só vale 30 dias depois da inclusão");
  igual(
    diferencaEmDiasUTC(prazoIndicacao(ficta), inclusao),
    60,
    "logo, o prazo de indicar cai 60 dias depois da inclusão — contar do e-mail encurtaria 30 dias",
  );
}

console.log("\nTransferência — CTB, art. 123, §1º e art. 134 (a janela composta)\n");
igual(DIAS_NOVO_CRV, 30, "comprador tem 30 dias para o novo CRV");
igual(
  DIAS_COMUNICACAO_VENDA,
  90,
  "vendedor: 60 dias contados do FIM dos 30 do comprador = dia 90 (somar 60 direto erraria 1 mês)",
);

console.log("\nPontuação — CTB, art. 259, §4º, II (sete dispositivos não pontuam)\n");
ok(ARTIGOS_SEM_PONTUACAO.includes("233"), "art. 233 (não transferir em 30 dias) é média COM remoção e SEM ponto");
ok(ARTIGOS_SEM_PONTUACAO.includes("232"), "art. 232 (sem documento de porte obrigatório) não pontua");
igual(ARTIGOS_SEM_PONTUACAO.length, 8, "a lista cobre os 7 dispositivos (o 230 aparece em 2 incisos)");

console.log("\nLimite de pontos — CTB, art. 261 (com EAR é 40 fixo; sem EAR depende das gravíssimas)\n");
igual(limiteDePontos(true, 0), 40, "EAR sem gravíssima: 40");
igual(limiteDePontos(true, 3), 40, "EAR com 3 gravíssimas: AINDA 40 — §5º, independe da natureza");
igual(limiteDePontos(false, 0), 40, "sem EAR e sem gravíssima: 40");
igual(limiteDePontos(false, 1), 30, "sem EAR com 1 gravíssima: 30");
igual(limiteDePontos(false, 2), 20, "sem EAR com 2 gravíssimas: 20");
igual(limiteDePontos(false, 5), 20, "sem EAR com 5 gravíssimas: continua 20 (não cai abaixo)");

console.log("\nTrava de licenciamento — CTB, art. 284, §3º (só com a instância encerrada)\n");
ok(!travaLicenciamento("AUTUADA"), "multa recém-autuada NÃO trava");
ok(!travaLicenciamento("RECURSO_JARI"), "multa em recurso NÃO trava — cobrar aqui é cobrar o que ainda não é devido");
ok(travaLicenciamento("INSTANCIA_ENCERRADA"), "só trava com a instância administrativa encerrada");
ok(!travaLicenciamento("PAGA"), "paga não trava (já foi resolvida)");

console.log("\nDPVAT/SPVAT — revogados, não podem existir como tipo\n");
ok(
  !TIPOS_DOCUMENTO_VEICULO.some((t) => /DPVAT|SPVAT/i.test(t.value) || /DPVAT|SPVAT/i.test(t.label)),
  "nenhum tipo de documento menciona DPVAT ou SPVAT (seria alerta que nunca resolve)",
);

console.log("\nPlaca — normalização e os dois formatos que convivem na frota\n");
igual(normalizarPlaca("abc-1234"), "ABC1234", "placa antiga com hífen e minúscula normaliza");
igual(normalizarPlaca(" abc 1d23 "), "ABC1D23", "Mercosul com espaços normaliza");
ok(placaValida("ABC1234"), "placa antiga é válida");
ok(placaValida("ABC1D23"), "placa Mercosul é válida");
ok(!placaValida("ABC12345"), "8 caracteres não é placa");
ok(!placaValida("AB1234"), "2 letras não é placa");
igual(formatarPlaca("ABC1D23"), "ABC-1D23", "formatação para a tela");

console.log("\nSeveridade — derivada de (dias restantes × impacto), nunca digitada\n");
igual(severidadeDe(-1, "INDICAR_CONDUTOR"), "CRITICA", "indicação vencida é crítica (vai custar 3×)");
igual(severidadeDe(5, "INDICAR_CONDUTOR"), "CRITICA", "indicação a 5 dias é crítica");
igual(severidadeDe(20, "INDICAR_CONDUTOR"), "ALTA", "indicação a 20 dias é alta");
igual(severidadeDe(20, "DOCUMENTO_VEICULO"), "ATENCAO", "documento genérico a 20 dias é só atenção");
igual(severidadeDe(-1, "DOCUMENTO_VEICULO"), "ALTA", "documento genérico vencido é alta, não crítica");
igual(severidadeDe(45, "LICENCIAMENTO"), "ATENCAO", "fora de 30 dias tudo é atenção");

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
