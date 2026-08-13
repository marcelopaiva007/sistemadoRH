// Regra dos últimos 8 dígitos — a comparação de telefone do sistema.
//
// Três coisas dependem dela e PRECISAM concordar: o bot do Telegram achando a
// ficha de quem compartilhou o contato, o alerta de prováveis duplicatas na
// lista de Colaboradores e a busca por telefone dessa mesma lista. Enquanto
// cada um tinha sua cópia, "o número está em outra ficha?" podia receber três
// respostas diferentes na mesma tarde.
//
// Sem banco de propósito: é função pura, roda em qualquer lugar.

import { digitosDe, sufixoTelefone, telefoneCasaBusca } from "../lib/telefone";
import { encontrarDuplicados, type PessoaParaComparar } from "../lib/duplicados";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

console.log("\nDígitos\n");
ok(digitosDe("(83) 98145-6383") === "83981456383", "tira máscara de telefone");
ok(digitosDe(null) === "", "null vira string vazia, não quebra");
ok(digitosDe(undefined) === "", "undefined vira string vazia");

console.log("\nSufixo de 8 dígitos\n");
// Os quatro formatos em que o MESMO número aparece na base real.
const MESMO_NUMERO = ["83981456383", "(83) 98145-6383", "+55 83 98145-6383", "5583981456383"];
const sufixos = MESMO_NUMERO.map(sufixoTelefone);
ok(
  sufixos.every((s) => s === "81456383"),
  `os quatro formatos do mesmo número dão o mesmo sufixo (${sufixos.join(", ")})`,
);
ok(sufixoTelefone("8398") === null, "número truncado no cadastro não vira sufixo — não casa com ninguém");
ok(sufixoTelefone(null) === null, "sem telefone não há sufixo");
ok(sufixoTelefone("83993219261") === "93219261", "segundo número real, sufixo próprio");
ok(
  sufixoTelefone("83981456383") !== sufixoTelefone("83993219261"),
  "números diferentes não colidem",
);

console.log("\nBusca por telefone\n");
const FICHA = "(83) 98145-6383";
ok(telefoneCasaBusca(FICHA, "83981456383"), "colar o número inteiro acha a ficha formatada");
ok(telefoneCasaBusca(FICHA, "5583981456383"), "com +55 na frente também acha");
ok(telefoneCasaBusca(FICHA, "981456383"), "sem o DDD acha (9 dígitos, ainda é sufixo)");
ok(telefoneCasaBusca(FICHA, "6383"), "pedaço curto do fim acha por includes");
ok(!telefoneCasaBusca(FICHA, "93219261"), "o número de OUTRA pessoa não acha esta ficha");
ok(!telefoneCasaBusca(null, "83981456383"), "ficha sem telefone nunca casa");
ok(!telefoneCasaBusca(FICHA, ""), "termo vazio não casa (senão a busca acharia todo mundo)");
// O nono dígito é a armadilha clássica: a base tem números antigos sem ele.
ok(
  telefoneCasaBusca("8381456383", "83981456383"),
  "ficha antiga sem o nono dígito casa com o número atual — os 8 finais são os mesmos",
);

console.log("\nDuplicatas usam a MESMA regra\n");
const pessoa = (p: Partial<PessoaParaComparar> & { id: string }): PessoaParaComparar => ({
  nome: `Pessoa ${p.id}`,
  telefone: null,
  cpf: null,
  setorNome: "Operações",
  ativo: true,
  temTelegram: false,
  ...p,
});

const pessoas: PessoaParaComparar[] = [
  pessoa({ id: "a", nome: "Nicollas Cardoso", telefone: "83981456383", cpf: "71493065432" }),
  pessoa({ id: "b", nome: "N. Cardoso", telefone: "(83) 98145-6383" }),
  pessoa({ id: "c", nome: "Edalysson Figueiredo", telefone: "83993219261", cpf: "09428744476" }),
];
const grupos = encontrarDuplicados(pessoas);
const porTelefone = grupos.filter((g) => g.motivo === "Mesmo telefone");
ok(porTelefone.length === 1, "duas grafias do mesmo número viram UM grupo de duplicata");
ok(
  porTelefone[0]?.pessoas.map((p) => p.id).sort().join(",") === "a,b",
  "o grupo é exatamente quem divide o número",
);
ok(
  !grupos.some((g) => g.pessoas.some((p) => p.id === "c")),
  "quem tem número próprio fica de fora",
);

// A ficha truncada não pode arrastar ninguém para um grupo de duplicata.
const comTruncado = encontrarDuplicados([
  ...pessoas,
  pessoa({ id: "d", telefone: "8398" }),
  pessoa({ id: "e", telefone: "8399" }),
]);
ok(
  !comTruncado.some((g) => g.motivo === "Mesmo telefone" && g.pessoas.some((p) => p.id === "d" || p.id === "e")),
  "telefones truncados não formam duplicata entre si nem com ninguém",
);

console.log("\nVarredura por CPF\n");
const porCpf = encontrarDuplicados([
  pessoa({ id: "x1", nome: "Maria Sousa", cpf: "71493065432" }),
  pessoa({ id: "x2", nome: "Maria Souza", cpf: "714.930.654-32" }),
]);
ok(porCpf.length === 1 && porCpf[0].motivo === "Mesmo CPF", "CPF com e sem máscara é o mesmo CPF");
ok(porCpf[0].gravidade === "alta", "duas fichas ATIVAS com o mesmo CPF é gravidade alta");

// CPF é prova e roda primeiro: quem ele junta não reaparece como "mesmo
// telefone". Ficha duplicada repete os dois, e o par sairia duas vezes na tela.
const cpfEtelefone = encontrarDuplicados([
  pessoa({ id: "y1", cpf: "71493065432", telefone: "83981456383" }),
  pessoa({ id: "y2", cpf: "71493065432", telefone: "83981456383" }),
]);
ok(cpfEtelefone.length === 1, "mesmo CPF E mesmo telefone viram UM grupo, não dois");
ok(cpfEtelefone[0].motivo === "Mesmo CPF", "e o motivo é o mais forte dos dois");

console.log("\nGravidade: o que trava alguém hoje vem primeiro\n");

// O caso que motivou a varredura: a ficha DESLIGADA está com o Telegram, e o
// bot recusa quem está na ativa com "já vinculado a outro colaborador".
const telegramPreso = encontrarDuplicados([
  pessoa({ id: "z1", nome: "Nicollas Cardoso", cpf: "71493065432", ativo: true }),
  pessoa({ id: "z2", nome: "Nicolas Cardozo", cpf: "71493065432", ativo: false, temTelegram: true }),
]);
ok(telegramPreso[0]?.gravidade === "alta", "desligado segurando o Telegram é gravidade alta");

// Recontratação normal: mesma pessoa, ficha velha encerrada, nada preso.
const recontratado = encontrarDuplicados([
  pessoa({ id: "r1", cpf: "09428744476", ativo: true }),
  pessoa({ id: "r2", cpf: "09428744476", ativo: false }),
]);
ok(recontratado[0]?.gravidade === "baixa", "ativo + desligado sem Telegram preso é baixa (recontratação)");

// Sem desligados na comparação, o caso do Nicollas seria invisível — que era
// exatamente o estado da tela até 13/08/2026.
ok(
  encontrarDuplicados([pessoa({ id: "s1", cpf: "71493065432", ativo: true })]).length === 0,
  "ficha sozinha não é duplicata de ninguém",
);

const ordenados = encontrarDuplicados([
  pessoa({ id: "b1", cpf: "11111111111", ativo: true }),
  pessoa({ id: "b2", cpf: "11111111111", ativo: false }),
  pessoa({ id: "a1", cpf: "22222222222", ativo: true }),
  pessoa({ id: "a2", cpf: "22222222222", ativo: true }),
]);
ok(
  ordenados[0].gravidade === "alta" && ordenados[ordenados.length - 1].gravidade === "baixa",
  "a lista sai ordenada: resolver agora no topo, recontratação no fim",
);

console.log(falhas === 0 ? "\n✅ Telefone: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
