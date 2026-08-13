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
const pessoas: PessoaParaComparar[] = [
  { id: "a", nome: "Nicollas Cardoso", telefone: "83981456383", cpf: "71493065432", setorNome: "Operações" },
  { id: "b", nome: "N. Cardoso", telefone: "(83) 98145-6383", cpf: null, setorNome: "Operações" },
  { id: "c", nome: "Edalysson Figueiredo", telefone: "83993219261", cpf: "09428744476", setorNome: "Operações" },
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
  { id: "d", nome: "Fulano Truncado", telefone: "8398", cpf: null, setorNome: "Operações" },
  { id: "e", nome: "Sicrano Truncado", telefone: "8399", cpf: null, setorNome: "Operações" },
]);
ok(
  !comTruncado.some((g) => g.motivo === "Mesmo telefone" && g.pessoas.some((p) => p.id === "d" || p.id === "e")),
  "telefones truncados não formam duplicata entre si nem com ninguém",
);

console.log(falhas === 0 ? "\n✅ Telefone: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
