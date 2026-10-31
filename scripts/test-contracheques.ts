// Envio de contracheques — a regra pura: situação de cada contracheque,
// tipo de folha e competência.
//
//   npx tsx scripts/test-contracheques.ts
import {
  competenciaDoTexto,
  rotuloDoContracheque,
  situacaoDo,
  tipoFolhaDaChave,
} from "../lib/contracheques/situacao";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const d = new Date(Date.UTC(2026, 8, 10));
const base = { enviadoEm: null, canal: null, vistoEm: null, confirmadoEm: null };

console.log("1. Situação:");
ok(situacaoDo(null) === "NAO_ENVIADO", "sem recibo → não enviado");
ok(situacaoDo(base) === "NAO_ENVIADO", "recibo criado sem envio → não enviado");
ok(situacaoDo({ ...base, enviadoEm: d }) === "SEM_CANAL", "tentou avisar e não havia canal → sem como avisar");
ok(situacaoDo({ ...base, enviadoEm: d, canal: "TELEGRAM" }) === "ENVIADO", "avisado e não abriu");
ok(situacaoDo({ ...base, enviadoEm: d, canal: "EMAIL", vistoEm: d }) === "ABERTO", "abriu e não confirmou");
ok(situacaoDo({ ...base, enviadoEm: d, canal: "EMAIL", vistoEm: d, confirmadoEm: d }) === "CONFIRMADO", "confirmado com foto");

console.log("\n2. Folha e competência:");
ok(tipoFolhaDaChave("CONTRACHEQUE:2026-12:DECIMO_TERCEIRO") === "DECIMO_TERCEIRO", "13º lido da chave");
ok(tipoFolhaDaChave(null) === "MENSAL" && tipoFolhaDaChave("INFORME:2025") === "MENSAL", "sem chave de contracheque → mensal");
ok(tipoFolhaDaChave("CONTRACHEQUE:2026-12:INVENTADO") === "MENSAL", "tipo desconhecido não passa");
ok(rotuloDoContracheque(new Date(Date.UTC(2026, 7, 1)), "MENSAL") === "08/2026", "mensal: só o mês");
ok(rotuloDoContracheque(new Date(Date.UTC(2026, 11, 1)), "DECIMO_TERCEIRO") === "12/2026 (13º salário)", "13º aparece no rótulo");
ok(competenciaDoTexto("2026-08")?.toISOString() === "2026-08-01T00:00:00.000Z", "2026-08 → 1º de agosto UTC");
ok(competenciaDoTexto("2026-13") === null && competenciaDoTexto("ago/2026") === null, "competência inválida → null");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
