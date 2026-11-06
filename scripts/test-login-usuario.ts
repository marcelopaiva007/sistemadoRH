// As regras do NOME DE USUÁRIO (lib/login-usuario.ts) — desde a v1.191.0 o
// único jeito de entrar, e o que diz em qual grupo a pessoa entra. Puras: o
// "já existe?" é do banco e mora no scripts/smoke-identificador-login.ts.
//
//   npx tsx scripts/test-login-usuario.ts
import {
  LOGIN_MAX,
  candidatosDeLogin,
  normalizarLogin,
  problemaNoLogin,
  sufixoDoGrupo,
} from "../lib/login-usuario";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) falhas++;
}

console.log("\nComo o usuário é gravado\n");
ok(normalizarLogin("  Marcelo.LM ") === "marcelo.lm", "sem espaços nas pontas e em minúsculas");

console.log("\nUsuários que servem\n");
for (const bom of ["marcelo", "marcelo.lm", "joao.silva", "ana_souza", "rh-centrysol", "abc", "a1b"]) {
  ok(problemaNoLogin(bom) === null, `aceita ${JSON.stringify(bom)}`);
}
ok(problemaNoLogin("a".repeat(LOGIN_MAX)) === null, `aceita ${LOGIN_MAX} caracteres`);

console.log("\nUsuários recusados, com o motivo certo\n");
ok(/“@”/.test(problemaNoLogin("marcelo@gmail.com") ?? ""), "e-mail no lugar do usuário: explica que o acesso não é por e-mail");
ok(/espaços/.test(problemaNoLogin("marcelo paiva") ?? ""), "espaço no meio");
ok(/pelo menos/.test(problemaNoLogin("ab") ?? ""), "curto demais");
ok(/no máximo/.test(problemaNoLogin("a".repeat(LOGIN_MAX + 1)) ?? ""), "longo demais");
ok(/sem acento/.test(problemaNoLogin("joão") ?? ""), "acento");
ok(/sem acento/.test(problemaNoLogin("marcelo!") ?? ""), "símbolo");
ok(/começar e terminar/.test(problemaNoLogin(".marcelo") ?? ""), "começando com ponto");
ok(/começar e terminar/.test(problemaNoLogin("marcelo.") ?? ""), "terminando com ponto");
ok(/reservados/.test(problemaNoLogin("colaborador.123") ?? ""), "prefixo dos acessos de portal");
ok(problemaNoLogin("colaborador") === null, "…mas “colaborador” sozinho é um nome comum");
ok(problemaNoLogin("") !== null, "vazio");

console.log("\nO sufixo de cada grupo\n");
ok(sufixoDoGrupo("LM Telecom") === "lm", "LM Telecom → lm");
ok(sufixoDoGrupo("L&M Telecom") === "lm", "L&M Telecom → lm");
ok(sufixoDoGrupo("l & m telecom") === "lm", "l & m telecom → lm");
ok(sufixoDoGrupo("Demais marcas") === "demais", "Demais marcas → demais");
ok(sufixoDoGrupo("Grupo Centrysol") === "centrysol", "Grupo Centrysol → centrysol");
ok(sufixoDoGrupo("Água Branca") === "agua", "sem acento");
ok(sufixoDoGrupo(null) === "grupo", "grupo sem nome");

console.log("\nSugestão para a mesma pessoa em outro grupo\n");
{
  const c = candidatosDeLogin("marcelo", "LM Telecom");
  ok(c[0] === "marcelo.lm", "marcelo no grupo LM → marcelo.lm");
  ok(c[1] === "marcelo.lm2", "…e, se ocupado, marcelo.lm2");
}
ok(candidatosDeLogin("marcelo.lm", "LM Telecom")[1] === "marcelo.lm2", "já termina em .lm: não vira marcelo.lm.lm");
ok(candidatosDeLogin("marcelo", "Demais marcas")[0] === "marcelo.demais", "nas demais marcas → marcelo.demais");
ok(
  candidatosDeLogin("a".repeat(LOGIN_MAX - 1), "LM Telecom").every((x) => x.length <= LOGIN_MAX),
  "nenhuma sugestão passa do tamanho máximo",
);
ok(candidatosDeLogin("marcelo", "LM").every((x) => problemaNoLogin(x) === null), "toda sugestão passa nas regras");

if (falhas > 0) {
  console.log(`\n❌ ${falhas} falha(s).\n`);
  process.exit(1);
}
console.log("\n✅ Tudo certo.\n");
