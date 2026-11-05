// O `?volta=` do login da área de administração (lib/admin-volta.ts) só pode
// devolver a pessoa para DENTRO de /admin — senão o link do login vira
// redirecionamento aberto (logou, foi parar num site qualquer).
//
//   npx tsx scripts/test-admin-volta.ts
import { voltaDoAdmin } from "../lib/admin-volta";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) falhas++;
}

console.log("\nAceita caminho dentro de /admin\n");
ok(voltaDoAdmin("/admin/usuarios") === "/admin/usuarios", "/admin/usuarios");
ok(voltaDoAdmin("/admin/usuarios?grupo=abc") === "/admin/usuarios?grupo=abc", "mantém a query (?grupo=)");
ok(voltaDoAdmin("/admin/perfis") === "/admin/perfis", "/admin/perfis");

console.log("\nRecusa o que levaria para fora, ou em círculo\n");
for (const ruim of [
  "https://exemplo.com/admin/usuarios",
  "//exemplo.com",
  "/\\exemplo.com",
  "/admin\\..\\..\\x",
  "/admin",
  "/admin/login",
  "/admin/login?volta=/admin/usuarios",
  "/usuarios",
  "/rh/empresas",
  "admin/usuarios",
  "/admin/\u0000x",
  "",
]) {
  ok(voltaDoAdmin(ruim) === null, `recusa ${JSON.stringify(ruim)}`);
}
ok(voltaDoAdmin(undefined) === null, "recusa ausente");
ok(voltaDoAdmin(["/admin/usuarios"]) === null, "recusa o que não é texto");

if (falhas > 0) {
  console.log(`\n❌ ${falhas} falha(s).\n`);
  process.exit(1);
}
console.log("\n✅ Tudo passou.\n");
