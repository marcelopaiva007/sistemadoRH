// Apuração pergunta a pergunta.
//
// Até 15/08/2026 a tela de Resultados só calculava média por dimensão GPTW e
// por setor. Uma pesquisa de múltipla escolha — "você usou o benefício?" — era
// possível de criar, de enviar e de responder, e IMPOSSÍVEL de ler: a tela não
// mostrava nada. Estes testes fixam a leitura que faltava.

import { apurarPorPergunta, type ItemRespondido, type PerguntaParaApurar } from "../lib/pesquisa-apuracao";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// Uma pesquisa de uso de benefício, que é o caso que motivou tudo isto.
const PERGUNTAS: PerguntaParaApurar[] = [
  {
    id: "p1", ordem: 1, enunciado: "Você já usou o benefício?", tipo: "MULTIPLE_CHOICE",
    opcoes: [
      { id: "o-nunca", texto: "Nunca usei", ordem: 1 },
      { id: "o-1x", texto: "1 vez", ordem: 2 },
      { id: "o-varias", texto: "4 ou mais", ordem: 3 },
    ],
  },
  { id: "p2", ordem: 2, enunciado: "Que nota você dá?", tipo: "NPS_10", opcoes: [] },
  { id: "p3", ordem: 3, enunciado: "O que faria você usar mais?", tipo: "TEXT", opcoes: [] },
];

const item = (p: Partial<ItemRespondido> & { perguntaId: string }): ItemRespondido => ({
  valorNumerico: null, valorTexto: null, opcaoId: null, ...p,
});

console.log("\nMúltipla escolha: distribuição, que é o que existe\n");

const r = apurarPorPergunta(PERGUNTAS, [
  item({ perguntaId: "p1", opcaoId: "o-nunca" }),
  item({ perguntaId: "p1", opcaoId: "o-nunca" }),
  item({ perguntaId: "p1", opcaoId: "o-nunca" }),
  item({ perguntaId: "p1", opcaoId: "o-1x" }),
]);
const p1 = r.find((q) => q.perguntaId === "p1")!;

ok(p1.respondentes === 4, "conta quem respondeu esta pergunta");
ok(p1.media === null, "múltipla escolha NÃO tem média — 'Nunca usei' não é um número");
ok(
  p1.distribuicao.map((f) => `${f.rotulo}=${f.quantidade}/${f.percentual}%`).join(" ") ===
    "Nunca usei=3/75% 1 vez=1/25%",
  `distribuição com contagem e percentual (${p1.distribuicao.map((f) => f.rotulo + " " + f.percentual + "%").join(", ")})`,
);
ok(
  !p1.distribuicao.some((f) => f.rotulo === "4 ou mais"),
  "opção que ninguém escolheu não vira fatia de 0%",
);

// A ordem é a do FORMULÁRIO, não a da contagem: "Nunca / 1 vez / 4 ou mais" é
// uma escala, e ordenar pelo mais votado a embaralharia.
const ordenado = apurarPorPergunta(PERGUNTAS, [
  item({ perguntaId: "p1", opcaoId: "o-varias" }),
  item({ perguntaId: "p1", opcaoId: "o-varias" }),
  item({ perguntaId: "p1", opcaoId: "o-nunca" }),
]).find((q) => q.perguntaId === "p1")!;
ok(
  ordenado.distribuicao[0].rotulo === "Nunca usei",
  "a ordem é a do formulário, mesmo com a última opção sendo a mais votada",
);

console.log("\nPergunta numérica: média E distribuição\n");

const comNotas = apurarPorPergunta(PERGUNTAS, [
  item({ perguntaId: "p2", valorNumerico: 0 }),
  item({ perguntaId: "p2", valorNumerico: 10 }),
]).find((q) => q.perguntaId === "p2")!;

ok(comNotas.media === 5, "média de 0 e 10 é 5");
// O ponto da distribuição junto da média: 5 aqui não é "todo mundo achou
// mediano", é "metade odiou e metade adorou" — decisões opostas.
ok(
  comNotas.distribuicao.length === 2 && comNotas.distribuicao[0].rotulo === "0",
  "e a distribuição mostra que ninguém deu 5 — média sozinha esconderia isso",
);

console.log("\nTexto livre: aparece, e vazio não conta\n");

const comTextos = apurarPorPergunta(PERGUNTAS, [
  item({ perguntaId: "p3", valorTexto: "Não sabia que existia" }),
  item({ perguntaId: "p3", valorTexto: "   " }),
  item({ perguntaId: "p3", valorTexto: "" }),
]).find((q) => q.perguntaId === "p3")!;

ok(comTextos.textos.length === 1, "só o texto de verdade entra");
ok(comTextos.textos[0] === "Não sabia que existia", "e vem inteiro");
ok(comTextos.respondentes === 1, "quem deixou em branco não conta como respondente");

console.log("\nCasos de borda\n");

const semRespostas = apurarPorPergunta(PERGUNTAS, []);
ok(semRespostas.length === 3, "toda pergunta aparece, mesmo sem resposta nenhuma");
ok(
  semRespostas.every((q) => q.respondentes === 0 && q.distribuicao.length === 0),
  "e todas zeradas, sem quebrar",
);
ok(semRespostas[0].ordem === 1 && semRespostas[2].ordem === 3, "na ordem do formulário");

// Opção apagada depois de alguém já ter respondido: a resposta continua
// valendo e não pode sumir da conta.
const comOpcaoRemovida = apurarPorPergunta(PERGUNTAS, [
  item({ perguntaId: "p1", opcaoId: "o-nunca" }),
  item({ perguntaId: "p1", opcaoId: "o-que-nao-existe-mais" }),
]).find((q) => q.perguntaId === "p1")!;
ok(comOpcaoRemovida.respondentes === 2, "resposta de opção apagada continua contando");
ok(
  comOpcaoRemovida.distribuicao.some((f) => f.rotulo === "(opção removida)"),
  "e aparece nomeada, em vez de virar buraco silencioso no total",
);

console.log(falhas === 0 ? "\n✅ Apuração: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
