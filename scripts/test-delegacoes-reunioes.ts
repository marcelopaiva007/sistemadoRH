// A prova do motor de reuniões (lib/delegacoes/reunioes.ts): o que uma
// reunião exige para existir, e como ela vira a demanda de cada convocado —
// sem banco, como as demais suítes do módulo.
//
//   npx tsx scripts/test-delegacoes-reunioes.ts

import { demandaDaReuniao, validarReuniao } from "../lib/delegacoes/reunioes";
import { TITULO_MAXIMO, validarCriacao, prazoDoFormulario } from "../lib/delegacoes/estados";

let falhas = 0;
function ok(cond: boolean, descricao: string) {
  console.log(`${cond ? "✅" : "❌"} ${descricao}`);
  if (!cond) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

const AGORA = new Date("2026-09-01T12:00:00-03:00");
const AMANHA = new Date("2026-09-02T15:00:00-03:00");

console.log("\nO que uma reunião exige para existir\n");
{
  const base = { titulo: "Alinhamento da frota", dataHora: AMANHA, qtdConvocados: 3 };
  ok(validarReuniao(base, AGORA).ok, "assunto + data futura + convocados: passa");
  ok(!validarReuniao({ ...base, titulo: "  " }, AGORA).ok, "sem assunto, nega");
  ok(
    !validarReuniao({ ...base, titulo: "x".repeat(TITULO_MAXIMO + 1) }, AGORA).ok,
    `assunto acima de ${TITULO_MAXIMO} caracteres, nega`,
  );
  ok(!validarReuniao({ ...base, dataHora: null }, AGORA).ok, "sem data/hora, nega");
  ok(
    !validarReuniao({ ...base, dataHora: new Date("inválida") }, AGORA).ok,
    "data inválida (NaN), nega",
  );
  ok(
    !validarReuniao({ ...base, dataHora: new Date("2026-09-01T11:00:00-03:00") }, AGORA).ok,
    "reunião no passado, nega — geraria demanda já vencida e cobrança indevida",
  );
  ok(
    !validarReuniao({ ...base, dataHora: AGORA }, AGORA).ok,
    "reunião exatamente agora também nega — o aceite precisa de tempo antes",
  );
  ok(!validarReuniao({ ...base, qtdConvocados: 0 }, AGORA).ok, "sem convocados, nega");
}

console.log("\nA demanda de cada convocado — derivada, idêntica para todos\n");
{
  const d = demandaDaReuniao({
    titulo: "Alinhamento da frota",
    pauta: "SNE e emplacamento",
    local: "Sala da diretoria",
    dataHora: AMANHA,
  });
  igual(d.titulo, "Reunião: Alinhamento da frota", "o título ganha o prefixo 'Reunião: '");
  ok(d.descricao!.includes("02/09/2026"), "a descrição diz o dia (em Brasília)");
  ok(d.descricao!.includes("Sala da diretoria"), "e o local, quando existe");
  ok(d.descricao!.includes("Pauta: SNE e emplacamento"), "e a pauta, quando existe");
  ok(
    d.criterioAceite.includes("Comparecer"),
    "o critério de aceite é comparecer — o aceite da demanda é a confirmação de presença",
  );
  igual(d.evidenciaExigida, "TEXTO", "evidência TEXTO — participação escrita ou baixa direta");
  igual(d.periodicidadeRetorno, "SO_ATRASO", "retorno SO_ATRASO — reunião não pede reporte diário");

  const semExtras = demandaDaReuniao({ titulo: "Rápida", dataHora: AMANHA });
  ok(!semExtras.descricao!.includes("Pauta:"), "sem pauta, a descrição não inventa uma");
  ok(!semExtras.descricao!.includes(", em "), "sem local, a frase não fica com vírgula órfã");
}

console.log("\nO título nunca estoura o limite da demanda\n");
{
  const enorme = demandaDaReuniao({ titulo: "A".repeat(TITULO_MAXIMO), dataHora: AMANHA });
  ok(enorme.titulo.length <= TITULO_MAXIMO, "assunto no limite: truncado com reticências, cabe");
  ok(enorme.titulo.endsWith("…"), "e o corte é visível, não silencioso");
}

console.log("\nA demanda derivada passa na régua da própria máquina (regra 2)\n");
{
  // O contrato de verdade: o que demandaDaReuniao monta tem que ser aceito
  // por validarCriacao — se a máquina ganhar exigência nova, este teste cobra
  // a atualização do gerador no mesmo commit.
  const d = demandaDaReuniao({ titulo: "Alinhamento", dataHora: AMANHA });
  const veredito = validarCriacao({
    titulo: d.titulo,
    criterioAceite: d.criterioAceite,
    evidenciaExigida: d.evidenciaExigida,
    criticidade: 3,
    prazo: AMANHA,
    periodicidadeRetorno: d.periodicidadeRetorno,
    solicitanteId: "sol_1",
    responsavelId: "resp_1",
  });
  ok(veredito.ok, "a demanda de reunião satisfaz validarCriacao de ponta a ponta");
}

console.log("\nO instante vem do formulário como o prazo da demanda\n");
{
  const instante = prazoDoFormulario("2026-09-02T15:00");
  ok(instante !== null, "datetime-local vira instante (Brasília)");
  igual(
    validarReuniao(
      { titulo: "Com hora do formulário", dataHora: instante, qtdConvocados: 1 },
      AGORA,
    ).ok,
    true,
    "e o instante do formulário passa na validação da reunião",
  );
}

console.log("");
if (falhas > 0) {
  console.log(`❌ ${falhas} falha(s).`);
  process.exit(1);
}
console.log("✅ Tudo passou.");
