// As regras de contrato que o módulo aplica — mesmo espírito de
// scripts/test-processos-ctb.ts: a conta de data errada não dá erro em lugar
// nenhum, aparece meses depois como uma janela de denúncia perdida por
// decadência (Lei 8.245/1991, art. 51, §5º — não se suspende, não se
// interrompe) ou uma cláusula de reajuste nula de pleno direito
// (Lei 10.192/2001, art. 2º, §1º).
//
//   npx tsx scripts/test-processos-contratos.ts

import {
  MESES_MINIMOS_ENTRE_REAJUSTES,
  dataLimiteDenuncia,
  janelaRenovatoria,
  proximoReajuste,
  papeisDaContraparte,
} from "../lib/processos/contratos";
import { dataUTC } from "../lib/datas";

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
function dataIgual(recebido: Date | null, esperado: Date | null, descricao: string) {
  const passou = recebido?.getTime() === esperado?.getTime();
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${esperado?.toISOString() ?? "null"}`);
    console.log(`     recebido: ${recebido?.toISOString() ?? "null"}`);
    falhas++;
  }
}

console.log("\nData-limite de denúncia — a data que dispara o alerta crítico\n");
{
  const fim = dataUTC(2026, 12, 31);
  dataIgual(dataLimiteDenuncia(fim, 90), dataUTC(2026, 10, 2), "90 dias antes do fim");
  dataIgual(dataLimiteDenuncia(fim, null), null, "sem aviso prévio configurado, não existe data-limite (não é hoje)");
  dataIgual(dataLimiteDenuncia(null, 90), null, "sem data de fim, não existe data-limite");
  dataIgual(dataLimiteDenuncia(fim, 0), null, "aviso prévio zero não é o mesmo que 'no próprio dia' — trata como ausente");
}

console.log("\nJanela da ação renovatória — Lei 8.245/1991, art. 51, §5º (12 a 6 meses antes)\n");
{
  const fim = dataUTC(2027, 6, 30);
  const janela = janelaRenovatoria(fim, true);
  ok(janela !== null, "locação não residencial tem janela");
  if (janela) {
    dataIgual(janela.inicio, dataUTC(2026, 6, 30), "abre 12 meses antes do fim");
    dataIgual(janela.fim, dataUTC(2026, 12, 30), "fecha 6 meses antes do fim (última chamada)");
    ok(janela.inicio < janela.fim, "a janela abre antes de fechar");
  }
  ok(janelaRenovatoria(fim, false) === null, "contrato que NÃO é locação não residencial não tem janela — decadência não se aplica a ele");
  ok(janelaRenovatoria(null, true) === null, "sem data de fim, sem janela");
}

console.log("\nPróximo reajuste — sempre no futuro, ancorado no início do contrato\n");
{
  const inicioAntigo = dataUTC(2020, 5, 10);
  const hoje = dataUTC(2026, 8, 23);

  // Mês-base janeiro, periodicidade anual: o próximo é jan/2027, não jan/2026
  // (que já passou).
  dataIgual(proximoReajuste(inicioAntigo, 1, 12, hoje), dataUTC(2027, 1, 1), "mês-base já passado neste ano pula para o ano seguinte");
  // Mês-base ainda não chegado neste ano.
  dataIgual(proximoReajuste(inicioAntigo, 12, 12, hoje), dataUTC(2026, 12, 1), "mês-base futuro neste ano não pula ano");
  // Contrato antigo continua achando a PRÓXIMA ocorrência real, não a primeira.
  dataIgual(
    proximoReajuste(inicioAntigo, 3, 12, dataUTC(2030, 1, 1)),
    dataUTC(2030, 3, 1),
    "contrato de anos atrás calcula a partir de HOJE, não da assinatura",
  );
  dataIgual(
    proximoReajuste(inicioAntigo, 1, null, hoje),
    null,
    "sem periodicidade configurada, sem próximo reajuste — SEM_REAJUSTE não gera pendência",
  );
  dataIgual(proximoReajuste(null, 1, 12, hoje), null, "sem data de início, sem como ancorar o ciclo");
  ok(
    proximoReajuste(inicioAntigo, 1, 6, hoje) === null,
    `periodicidade menor que ${MESES_MINIMOS_ENTRE_REAJUSTES} meses não calcula data — a cláusula seria NULA de pleno direito (Lei 10.192/2001, art. 2º, §1º)`,
  );

  // Periodicidade bienal: o mês sozinho (1 a 12) não diz a que ANO o ciclo
  // pertence — só `dataInicio` ancora isso. Contrato começou em jun/2024,
  // mês-base janeiro: o primeiro ciclo válido é jan/2026 (jan/2024 já tinha
  // passado quando o contrato começou), o segundo é jan/2028.
  const inicioBienal = dataUTC(2024, 6, 15);
  dataIgual(
    proximoReajuste(inicioBienal, 1, 24, dataUTC(2025, 1, 1)),
    dataUTC(2026, 1, 1),
    "bienal: primeiro ciclo cai no ano seguinte ao início, não no ano do início",
  );
  dataIgual(
    proximoReajuste(inicioBienal, 1, 24, dataUTC(2026, 2, 1)),
    dataUTC(2028, 1, 1),
    "bienal: passado jan/2026, o próximo é jan/2028 — não jan/2027, que não é um ponto do ciclo",
  );
  // Mesmo mês-base e periodicidade, início DIFERENTE, muda a fase do ciclo.
  const inicioBienalPar = dataUTC(2023, 1, 1);
  dataIgual(
    proximoReajuste(inicioBienalPar, 1, 24, dataUTC(2026, 2, 1)),
    dataUTC(2027, 1, 1),
    "o mesmo mês-base/periodicidade com início diferente ancora num ano diferente do ciclo",
  );
}

console.log("\nPapéis da contraparte — CSV, mesma convenção de RegraAlerta\n");
{
  const papeis = papeisDaContraparte("FORNECEDOR, PRESTADOR_PJ ,CLIENTE");
  igual(papeis.length, 3, "três papéis, mesmo com espaço irregular no CSV");
  igual(papeis[0], "FORNECEDOR", "primeiro papel sem espaço sobrando");
  igual(papeisDaContraparte("").length, 0, "CSV vazio não vira array com string vazia dentro");
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
