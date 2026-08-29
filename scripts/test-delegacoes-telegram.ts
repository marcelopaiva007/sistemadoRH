// O módulo Delegações no Telegram — as partes que dá para provar sem banco e
// sem falar com a API: o codec dos botões, o texto da mensagem e o parser da
// data de repactuação.
//
// São exatamente os pontos que quebram calado: um `callback_data` acima de 64
// bytes o Telegram simplesmente NÃO ENTREGA (o botão não aparece), e uma data
// mal interpretada vira prazo errado sem ninguém perceber.
//
//   npx tsx scripts/test-delegacoes-telegram.ts

import {
  botoesDaCobranca,
  botoesDaDemandaNova,
  lerCallback,
  montarCallback,
  textoDaDemandaNova,
} from "../lib/delegacoes/telegram";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
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

// Um cuid de verdade tem 25 caracteres — é o que o Prisma gera.
const ID = "clз9x8y7w6v5u4t3s2r1q0p9o";
const ID_REAL = "cmf1a2b3c4d5e6f7g8h9i0j1k";

console.log("\nO callback_data cabe no limite do Telegram (64 bytes)\n");
{
  const acoes = ["ac", "rp", "ct", "np", "er", "tv", "en"] as const;
  for (const a of acoes) {
    const data = montarCallback(a, ID_REAL);
    const bytes = Buffer.byteLength(data, "utf8");
    ok(bytes <= 64, `${a}: ${bytes} bytes (limite 64) — acima disso o botão nem aparece`);
  }
  // Todos os botões das duas teclados, de uma vez.
  const todos = [
    ...botoesDaDemandaNova(ID_REAL).inline_keyboard.flat(),
    ...botoesDaCobranca(ID_REAL).inline_keyboard.flat(),
  ];
  ok(
    todos.every((b) => Buffer.byteLength(b.callback_data, "utf8") <= 64),
    `os ${todos.length} botões cabem no limite`,
  );
  ok(todos.every((b) => b.text.length > 0), "todo botão tem rótulo");
}

console.log("\nO codec vai e volta sem perder nada\n");
{
  igual(lerCallback(montarCallback("ac", ID_REAL)), { acao: "ac", demandaId: ID_REAL }, "ida e volta");
  igual(lerCallback(montarCallback("en", ID)), { acao: "en", demandaId: ID }, "id com acento também");
}

console.log("\nO codec RECUSA o que não é dele (o dado vem de fora)\n");
{
  // `callback_data` chega do Telegram, ou seja, de fora. Tudo que não casa
  // exatamente com o formato tem que virar null — e o webhook, ao ver null,
  // devolve o update para o fluxo normal em vez de agir.
  const lixo = [
    "",
    "qualquer coisa",
    "d:ac",
    "d:ac:",
    "d::id",
    "x:ac:id",
    "d:zz:id",
    "d:ac:id:extra",
    "D:AC:ID",
  ];
  for (const l of lixo) {
    ok(lerCallback(l) === null, `recusa ${JSON.stringify(l)}`);
  }
}

console.log("\nA mensagem leva o CRITÉRIO DE ACEITE — é o que a pessoa aceita\n");
{
  const demanda = {
    id: ID_REAL,
    titulo: "Levantar três orçamentos do gerador",
    descricao: "A torre 12 está com o gerador antigo.",
    criterioAceite: "Três orçamentos anexados, com prazo de entrega de cada fornecedor",
    evidenciaExigida: "LINK",
    criticidade: 2,
    prazo: new Date("2026-09-10T23:59:59-03:00"),
    solicitante: { nome: "Marcelo Paiva" },
  };
  const texto = textoDaDemandaNova(demanda);
  ok(texto.includes(demanda.titulo), "o título aparece");
  ok(texto.includes("Marcelo Paiva"), "quem pediu aparece");
  ok(texto.includes(demanda.criterioAceite), "O CRITÉRIO DE ACEITE aparece — aceitar sem ele é aceite cego");
  ok(texto.includes("10/09/2026"), "o prazo aparece no dia certo (fuso de Brasília)");
  ok(texto.includes("Alta"), "a criticidade aparece por extenso");
  ok(texto.toLowerCase().includes("link"), "a evidência exigida é anunciada antes da hora da entrega");

  // Sem descrição não pode sobrar linha em branco dobrada.
  const semDescricao = textoDaDemandaNova({ ...demanda, descricao: null });
  ok(!semDescricao.includes("\n\n\n"), "sem descrição, a mensagem não fica com buraco");

  // Texto livre com marcação não pode quebrar nada — não usamos Markdown.
  const comAsterisco = textoDaDemandaNova({
    ...demanda,
    titulo: "Revisar *contrato* [urgente] _agora_",
  });
  ok(
    comAsterisco.includes("Revisar *contrato* [urgente] _agora_"),
    "asterisco e colchete no título passam intactos (mensagem é texto puro)",
  );
}

console.log("\nO prazo na mensagem conta os dias certos\n");
{
  const base = {
    id: ID_REAL,
    titulo: "x",
    descricao: null,
    criterioAceite: "y",
    evidenciaExigida: "TEXTO",
    criticidade: 3,
    solicitante: { nome: "z" },
  };
  // Uma data bem no futuro: o texto tem que dizer "em N dias", não "hoje".
  const longe = textoDaDemandaNova({ ...base, prazo: new Date("2099-01-01T23:59:59-03:00") });
  ok(/em \d+ dias/.test(longe), "prazo distante vira 'em N dias'");
  const passado = textoDaDemandaNova({ ...base, prazo: new Date("2020-01-01T23:59:59-03:00") });
  ok(passado.includes("prazo já vencido"), "prazo no passado é dito com todas as letras");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
