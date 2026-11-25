// Periodicidade do ASO periódico pela NR-7, item 7.5.8 (lib/aso-periodicidade.ts).
// Nada aqui toca o banco.
//   npx tsx scripts/test-aso-periodicidade.ts
import { periodicidadeAso, vencimentoAsoEfetivo, vencimentoAsoNr7 } from "@/lib/aso-periodicidade";
import { situacaoDoExame } from "@/lib/conformidade";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}
const mesmaData = (a: Date | null, b: Date) => a !== null && a.getTime() === b.getTime();

const EXAME = dataUTC(2026, 11, 26);

console.log("Faixa etária na data do exame (17 / 18 / 45 / 46 anos)");
{
  const p17 = periodicidadeAso({ dataNascimento: dataUTC(2008, 11, 27) }, EXAME);
  ok(p17.meses === 12, "17 anos (faz 18 amanhã): anual");
  ok(p17.motivo.includes("menor de 18"), "motivo: menor de 18");

  const p18 = periodicidadeAso({ dataNascimento: dataUTC(2008, 11, 26) }, EXAME);
  ok(p18.meses === 24, "18 anos completos no dia do exame: a cada 2 anos");
  ok(p18.confirmarNoPcmso, "sem risco informado: pede para confirmar no PCMSO");

  const p45 = periodicidadeAso({ dataNascimento: dataUTC(1981, 1, 10) }, EXAME);
  ok(p45.meses === 24, "45 anos: ainda a cada 2 anos (\"maior de 45\" = 46+)");

  const p46 = periodicidadeAso({ dataNascimento: dataUTC(1980, 11, 26) }, EXAME);
  ok(p46.meses === 12, "46 anos completos no dia do exame: anual");
  ok(p46.motivo.includes("maior de 45"), "motivo: maior de 45");
  ok(!p46.confirmarNoPcmso, "faixa etária basta — não depende do PGR");

  const p45v = periodicidadeAso({ dataNascimento: dataUTC(1980, 11, 27) }, EXAME);
  ok(p45v.meses === 24, "45 anos na véspera dos 46: ainda 2 anos na data do exame");
}

console.log("Risco, doença crônica e falta de dado");
{
  const nasc30 = dataUTC(1996, 5, 5);
  ok(periodicidadeAso({ dataNascimento: nasc30, riscoOcupacional: true }, EXAME).meses === 12, "risco no PGR: anual, mesmo aos 30");
  ok(periodicidadeAso({ dataNascimento: nasc30, doencaCronica: true }, EXAME).meses === 12, "doença crônica: anual");
  const semRisco = periodicidadeAso({ dataNascimento: nasc30, riscoOcupacional: false }, EXAME);
  ok(semRisco.meses === 24 && !semRisco.confirmarNoPcmso, "risco informado como ausente: 2 anos, sem aviso");
  const semNasc = periodicidadeAso({ dataNascimento: null }, EXAME);
  ok(semNasc.meses === 12 && semNasc.confirmarNoPcmso, "sem data de nascimento: anual (lado seguro) e confirme no PCMSO");
}

console.log("Vencimento pela NR-7");
{
  const v30 = vencimentoAsoNr7(EXAME, { dataNascimento: dataUTC(1996, 5, 5) });
  ok(mesmaData(v30.vencimento, dataUTC(2028, 11, 26)), "30 anos sem risco: vence em 2 anos (26/11/2028)");

  const v46 = vencimentoAsoNr7(EXAME, { dataNascimento: dataUTC(1970, 1, 1) });
  ok(mesmaData(v46.vencimento, dataUTC(2027, 11, 26)), "56 anos: vence em 1 ano");

  const v17 = vencimentoAsoNr7(EXAME, { dataNascimento: dataUTC(2009, 3, 3) });
  ok(mesmaData(v17.vencimento, dataUTC(2027, 11, 26)), "17 anos: vence em 1 ano");

  // 45 anos, faz 46 em 10/01/2027 — antes dos 12 meses: vence em 1 ano.
  const v45 = vencimentoAsoNr7(EXAME, { dataNascimento: dataUTC(1981, 1, 10) });
  ok(mesmaData(v45.vencimento, dataUTC(2027, 11, 26)), "45 anos que faz 46 em 2 meses: vence em 1 ano");
  ok(v45.periodicidade.meses === 12, "e a periodicidade mostrada já é anual");

  // 44 anos, faz 46 em 01/06/2028 — entre 12 e 24 meses: vence no aniversário.
  const v44 = vencimentoAsoNr7(EXAME, { dataNascimento: dataUTC(1982, 6, 1) });
  ok(mesmaData(v44.vencimento, dataUTC(2028, 6, 1)), "44 anos que faz 46 antes dos 2 anos: vence no aniversário de 46");

  const bissexto = vencimentoAsoNr7(dataUTC(2024, 2, 29), { dataNascimento: dataUTC(1996, 5, 5) });
  ok(mesmaData(bissexto.vencimento, dataUTC(2026, 2, 28)), "exame em 29/02: 2 anos caem em 28/02");
}

console.log("Vencimento efetivo (data gravada x NR-7)");
{
  const perfil30 = { dataNascimento: dataUTC(1996, 5, 5) };
  const padraoAntigo = vencimentoAsoEfetivo(
    { tipo: "PERIODICO", realizadoEm: EXAME, validoAte: dataUTC(2027, 11, 26) },
    perfil30,
  );
  ok(mesmaData(padraoAntigo.validoAte, dataUTC(2028, 11, 26)), "12 meses gravados pelo padrão antigo: vale a NR-7 (2 anos)");
  ok(padraoAntigo.origem === "NR7", "origem NR7");

  const pcmsoCurto = vencimentoAsoEfetivo(
    { tipo: "PERIODICO", realizadoEm: EXAME, validoAte: dataUTC(2027, 5, 26) },
    perfil30,
  );
  ok(mesmaData(pcmsoCurto.validoAte, dataUTC(2027, 5, 26)), "6 meses digitados (prazo do PCMSO): vale a data gravada");
  ok(pcmsoCurto.origem === "GRAVADO", "origem GRAVADO");

  const longoDemais = vencimentoAsoEfetivo(
    { tipo: "ADMISSIONAL", realizadoEm: EXAME, validoAte: dataUTC(2029, 11, 26) },
    perfil30,
  );
  ok(mesmaData(longoDemais.validoAte, dataUTC(2028, 11, 26)), "3 anos digitados: a NR-7 é o teto (2 anos)");

  const semValidade = vencimentoAsoEfetivo({ tipo: "RETORNO_TRABALHO", realizadoEm: EXAME, validoAte: null }, perfil30);
  ok(mesmaData(semValidade.validoAte, dataUTC(2028, 11, 26)), "exame sem validade gravada: a NR-7 preenche");

  const demissional = vencimentoAsoEfetivo({ tipo: "DEMISSIONAL", realizadoEm: EXAME, validoAte: null }, perfil30);
  ok(demissional.validoAte === null, "demissional não tem vencimento");
}

console.log("situacaoDoExame com perfil (ficha e conformidade)");
{
  const exames = [
    { tipo: "PERIODICO", realizadoEm: dataUTC(2025, 6, 1), validoAte: dataUTC(2026, 6, 1), resultado: "APTO", restricoes: null },
  ];
  const hoje = dataUTC(2026, 11, 26);
  ok(situacaoDoExame(exames, hoje).situacao === "VENCIDO", "sem perfil: vale o gravado (vencido em 01/06/2026)");
  ok(
    situacaoDoExame(exames, hoje, { dataNascimento: dataUTC(1996, 5, 5) }).situacao === "EM_DIA",
    "30 anos pela NR-7: em dia até 01/06/2027",
  );
  ok(
    situacaoDoExame(exames, hoje, { dataNascimento: dataUTC(1970, 5, 5) }).situacao === "VENCIDO",
    "56 anos pela NR-7: continua vencido",
  );
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
