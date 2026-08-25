// O segundo fator do bot: separar CPF de data numa mensagem só, e conferir a
// data de nascimento. Parsing e fuso são onde isto erra calado.
//
//   npx tsx scripts/test-telegram-identidade.ts

import { conferirNascimento, extrairCpfEData, extrairData } from "../lib/telegram-identidade";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
// O mesmo `digitos` da rota: só os números.
const digitos = (s: string) => s.replace(/\D/g, "");

console.log("\nSeparar CPF e data da mesma mensagem\n");
{
  const r1 = extrairCpfEData("12345678900 15/03/1990", digitos);
  ok(r1.cpf === "12345678900", "CPF sem máscara sai limpo");
  ok(r1.data?.dia === 15 && r1.data?.mes === 3 && r1.data?.ano === 1990, "data lida certa");

  // Com máscara no CPF: os pontos e o traço não podem virar dígitos do CPF, e
  // a data não pode contaminar o CPF.
  const r2 = extrairCpfEData("123.456.789-00 15/03/1990", digitos);
  ok(r2.cpf === "12345678900", "CPF com máscara continua 11 dígitos, sem os da data");

  const r3 = extrairCpfEData("15-03-1990 12345678900", digitos);
  ok(r3.cpf === "12345678900" && r3.data?.mes === 3, "ordem invertida (data antes do CPF) também");

  const r4 = extrairCpfEData("12345678900", digitos);
  ok(r4.cpf === "12345678900" && r4.data === null, "só o CPF: data volta nula, para o bot pedir a data");

  const r5 = extrairCpfEData("oi, tudo bem?", digitos);
  ok(r5.cpf.length !== 11, "texto qualquer não vira tentativa de CPF");
}

console.log("\nExtrair data — separadores aceitos\n");
{
  ok(extrairData("15/03/1990") !== null, "barra");
  ok(extrairData("15-03-1990") !== null, "traço");
  ok(extrairData("15.03.1990") !== null, "ponto");
  ok(extrairData("15031990") === null, "8 dígitos colados NÃO viram data (ambíguo ao lado do CPF)");
  ok(extrairData("sem data aqui") === null, "sem data, null");
}

console.log("\nConferir nascimento — comparação em UTC\n");
{
  // Gravado à meia-noite UTC, como vem de um input de data.
  const nasc = new Date(Date.UTC(1990, 2, 15)); // mês 2 = março
  ok(conferirNascimento(nasc, { dia: 15, mes: 3, ano: 1990 }), "data igual confere");
  ok(!conferirNascimento(nasc, { dia: 16, mes: 3, ano: 1990 }), "dia diferente não confere");
  ok(!conferirNascimento(nasc, { dia: 15, mes: 4, ano: 1990 }), "mês diferente não confere");
  ok(!conferirNascimento(nasc, { dia: 15, mes: 3, ano: 1991 }), "ano diferente não confere");
  ok(!conferirNascimento(null, { dia: 15, mes: 3, ano: 1990 }), "ficha sem nascimento nunca confere");
  ok(!conferirNascimento(nasc, null), "sem data digitada nunca confere");

  // O deslize de fuso que a comparação em UTC evita: 15/03 à meia-noite UTC,
  // lido no fuso de Brasília (-03), seria 14/03 21h — `getDate()` daria 14.
  ok(conferirNascimento(nasc, { dia: 15, mes: 3, ano: 1990 }), "não escorrega um dia por causa do fuso");
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
