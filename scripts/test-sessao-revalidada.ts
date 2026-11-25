// "Esta sessão ainda vale?" (lib/sessao-revalidada.ts) — a regra que o
// callback `jwt` de auth.ts aplica a cada requisição desde 25/11/2026: conta
// desativada ou senha trocada depois do login derruba a sessão; papel e
// vínculos vêm do banco de agora, não da cópia do login.
//
//   npx tsx scripts/test-sessao-revalidada.ts
import {
  escolherEmpresaAtiva,
  sessaoAindaVale,
  type EmpresaNaSessao,
  type UsuarioParaRevalidar,
} from "../lib/sessao-revalidada";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) falhas++;
}

const vinculo = (empresaId: string, extra: Partial<EmpresaNaSessao> = {}): EmpresaNaSessao => ({
  empresaId,
  papel: "RH_MANAGER",
  setorId: null,
  papelPrincipal: false,
  ativo: true,
  ...extra,
});

const usuario = (extra: Partial<UsuarioParaRevalidar> = {}): UsuarioParaRevalidar => ({
  ativo: true,
  role: "RH_MANAGER",
  sessoesValidasDesde: null,
  empresas: [vinculo("emp-a")],
  ...extra,
});

const MARCADOR = new Date("2026-11-25T15:00:00.000Z");
const ANTES = MARCADOR.getTime() - 60_000;
const DEPOIS = MARCADOR.getTime() + 60_000;

console.log("\nConta que não vale mais\n");
ok(!sessaoAindaVale(null, DEPOIS), "conta apagada: cai");
ok(!sessaoAindaVale(usuario({ ativo: false }), DEPOIS), "conta desativada: cai");
ok(
  !sessaoAindaVale(usuario({ ativo: false, sessoesValidasDesde: null }), undefined),
  "desativada cai mesmo sem marcador e com token antigo",
);

console.log("\nMarcador nulo (toda conta antes de 25/11/2026)\n");
ok(sessaoAindaVale(usuario(), DEPOIS), "token com entrouEm: segue");
ok(sessaoAindaVale(usuario(), undefined), "token antigo, sem entrouEm: segue (ninguém cai no deploy)");

console.log("\nMarcador gravado (senha trocada, conta desativada e reativada)\n");
const comMarcador = usuario({ sessoesValidasDesde: MARCADOR });
ok(!sessaoAindaVale(comMarcador, ANTES), "entrou ANTES do marcador: cai");
ok(sessaoAindaVale(comMarcador, DEPOIS), "entrou DEPOIS do marcador: segue");
ok(sessaoAindaVale(comMarcador, MARCADOR.getTime()), "entrou no mesmo milissegundo: segue (quem trocou a senha)");
ok(!sessaoAindaVale(comMarcador, undefined), "token antigo, sem entrouEm: cai (não dá para provar que é posterior)");
ok(!sessaoAindaVale(comMarcador, "1764082800000"), "entrouEm que não é número: cai");
ok(!sessaoAindaVale(comMarcador, Number.NaN), "entrouEm NaN: cai");

console.log("\nVínculos e papel vêm do banco de agora\n");
// O token do login dizia empresa A; o banco agora diz só B (A foi retirada).
const atualizado = usuario({ role: "GESTOR_SETOR", empresas: [vinculo("emp-b", { setorId: "set-1" })] });
ok(sessaoAindaVale(atualizado, DEPOIS), "vínculo trocado não derruba a sessão");
const ativa = escolherEmpresaAtiva(atualizado.empresas, { empresaId: "emp-a" });
ok(ativa?.empresaId === "emp-b", "cookie apontando para CNPJ retirado cai no vínculo que restou");
ok(ativa?.setorId === "set-1", "setor vem do vínculo atual");
ok(escolherEmpresaAtiva([], { empresaId: "emp-a" }) === null, "sem vínculo nenhum: sem empresa ativa");

const varios = [vinculo("emp-a"), vinculo("emp-b", { papelPrincipal: true }), vinculo("emp-c")];
ok(escolherEmpresaAtiva(varios, { empresaId: "emp-c" })?.empresaId === "emp-c", "cookie válido vence");
ok(escolherEmpresaAtiva(varios, null)?.empresaId === "emp-b", "sem cookie: o vínculo principal");
ok(
  escolherEmpresaAtiva([vinculo("emp-x"), vinculo("emp-y")], null)?.empresaId === "emp-x",
  "sem principal: o primeiro da lista",
);

if (falhas > 0) {
  console.log(`\n❌ ${falhas} falha(s).\n`);
  process.exit(1);
}
console.log("\n✅ Tudo certo.\n");
