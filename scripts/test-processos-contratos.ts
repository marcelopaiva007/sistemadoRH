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
  // Aviso prévio maior que a própria vigência produzia data ANTERIOR ao
  // início: pendência nascida vencida, cobrando decisão impossível.
  dataIgual(
    dataLimiteDenuncia(dataUTC(2026, 7, 1), 210, dataUTC(2026, 1, 1)),
    null,
    "aviso prévio maior que a vigência não vira data-limite anterior ao início",
  );
  dataIgual(
    dataLimiteDenuncia(dataUTC(2026, 7, 1), 90, dataUTC(2026, 1, 1)),
    dataUTC(2026, 4, 2),
    "aviso prévio que cabe na vigência continua valendo",
  );
}

console.log("\nJanela da ação renovatória — Lei 8.245/1991, art. 51, §5º (12 a 6 meses antes)\n");
{
  const fim = dataUTC(2027, 6, 30);
  const inicioLongo = dataUTC(2024, 6, 30);
  const janela = janelaRenovatoria(fim, true, inicioLongo);
  ok(janela !== null, "locação não residencial tem janela");
  if (janela) {
    dataIgual(janela.inicio, dataUTC(2026, 6, 30), "abre 12 meses antes do fim");
    dataIgual(janela.fim, dataUTC(2026, 12, 30), "fecha 6 meses antes do fim (última chamada)");
    ok(janela.inicio < janela.fim, "a janela abre antes de fechar");
  }
  ok(janelaRenovatoria(fim, false, inicioLongo) === null, "contrato que NÃO é locação não residencial não tem janela — decadência não se aplica a ele");
  ok(janelaRenovatoria(null, true, inicioLongo) === null, "sem data de fim, sem janela");

  // O defeito que a revisão adversarial pegou: numa locação de 6 meses a
  // janela abria SEIS MESES ANTES de o contrato existir e fechava no próprio
  // dia de início — a pendência nascia vencida e crítica no dia do cadastro.
  ok(
    janelaRenovatoria(dataUTC(2026, 7, 1), true, dataUTC(2026, 1, 1)) === null,
    "locação curta demais não gera janela que começa antes do próprio contrato",
  );
  ok(
    janelaRenovatoria(dataUTC(2027, 1, 1), true, dataUTC(2026, 1, 1)) !== null,
    "locação de 12 meses tem janela que cabe dentro da vigência",
  );
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
  // pertence — quem ancora é `dataInicio` mais uma periodicidade inteira.
  // Contrato de jun/2024 com mês-base janeiro: 24 meses caem em jun/2026, e o
  // primeiro janeiro a partir dali é jan/2027. Depois, de dois em dois anos.
  const inicioBienal = dataUTC(2024, 6, 15);
  dataIgual(
    proximoReajuste(inicioBienal, 1, 24, dataUTC(2025, 1, 1)),
    dataUTC(2027, 1, 1),
    "bienal: o primeiro ciclo respeita os 24 meses inteiros a partir do início",
  );
  dataIgual(
    proximoReajuste(inicioBienal, 1, 24, dataUTC(2027, 2, 1)),
    dataUTC(2029, 1, 1),
    "bienal: passado jan/2027, o próximo é jan/2029 — não jan/2028",
  );
  // Mesmo mês-base e periodicidade, início DIFERENTE, muda a FASE do ciclo:
  // um reajusta nos ímpares, o outro nos pares.
  const inicioBienalPar = dataUTC(2023, 1, 1);
  dataIgual(
    proximoReajuste(inicioBienalPar, 1, 24, dataUTC(2024, 2, 1)),
    dataUTC(2025, 1, 1),
    "início em jan/2023 põe o ciclo bienal em 2025, 2027…",
  );
  dataIgual(
    proximoReajuste(inicioBienal, 1, 24, dataUTC(2024, 2, 1)),
    dataUTC(2027, 1, 1),
    "o mesmo mês-base/periodicidade com início diferente ancora numa fase diferente",
  );

  // O piso de uma periodicidade inteira. O mês-base diz o MÊS do ciclo, não
  // autoriza encurtá-lo: contrato que começa em junho com mês-base setembro
  // reajustava em TRÊS meses — a cláusula nula que a action recusa na entrada.
  dataIgual(
    proximoReajuste(dataUTC(2026, 6, 1), 9, 12, dataUTC(2026, 6, 2)),
    dataUTC(2027, 9, 1),
    "primeiro reajuste nunca cai antes de completar uma periodicidade inteira",
  );
  dataIgual(
    proximoReajuste(dataUTC(2026, 9, 1), 9, 12, dataUTC(2026, 9, 2)),
    dataUTC(2027, 9, 1),
    "início no próprio mês-base reajusta um ano depois, não no mesmo mês",
  );

  // O ciclo passa a contar do último reajuste APLICADO — é o que devolve o
  // contrato à fila em vez de deixar a pendência vencida para sempre.
  dataIgual(
    proximoReajuste(dataUTC(2025, 1, 1), 1, 12, dataUTC(2027, 1, 5), dataUTC(2027, 1, 5)),
    dataUTC(2028, 1, 1),
    "reajuste aplicado em jan/2027 reagenda para jan/2028",
  );
  dataIgual(
    proximoReajuste(dataUTC(2025, 1, 1), 1, 24, dataUTC(2027, 1, 5), dataUTC(2027, 1, 5)),
    dataUTC(2029, 1, 1),
    "bienal aplicado em 2027 reagenda para 2029, não 2028",
  );
  ok(
    proximoReajuste(dataUTC(2025, 1, 1), 1, 12, dataUTC(2027, 1, 5), dataUTC(2027, 1, 5))! >
      dataUTC(2027, 1, 5),
    "depois de aplicado, o próximo reajuste está sempre no futuro — a pendência fecha",
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
