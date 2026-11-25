// Aviso ao colaborador quando o RH responde o "Fale com o RH"
// (lib/aviso-resposta-portal.ts). Nada aqui toca o banco.
//   npx tsx scripts/test-aviso-resposta-portal.ts
//
// Duas garantias (26/11/2026): o canal segue a ordem do sistema (Telegram, e
// o e-mail do cadastro como reserva; desligado não recebe), e o texto NUNCA
// leva o conteúdo da conversa — só avisa e diz como abrir o portal.
import { canaisDoAvisoDeResposta, montarAvisoDeResposta } from "@/lib/aviso-resposta-portal";
import { BOT_DO_RH } from "@/lib/bot-do-rh";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

console.log("1. Canal");
ok(
  iguais(canaisDoAvisoDeResposta({ ativo: true, telegramChatId: "123", email: "a@b.com" }), ["TELEGRAM", "EMAIL"]),
  "Telegram primeiro, e-mail como reserva",
);
ok(iguais(canaisDoAvisoDeResposta({ ativo: true, telegramChatId: null, email: "a@b.com" }), ["EMAIL"]), "sem Telegram: e-mail");
ok(iguais(canaisDoAvisoDeResposta({ ativo: true, telegramChatId: "123", email: null }), ["TELEGRAM"]), "sem e-mail: Telegram");
ok(canaisDoAvisoDeResposta({ ativo: true, telegramChatId: "  ", email: "" }).length === 0, "campos em branco não são canal");
ok(
  canaisDoAvisoDeResposta({ ativo: false, telegramChatId: "123", email: "a@b.com" }).length === 0,
  "desligado não recebe (o portal recusa quem saiu)",
);

console.log("2. Texto");
const aviso = montarAvisoDeResposta("MARIA DA SILVA", "LM Telecom");
ok(aviso.telegram.includes("Oi, Maria!"), "cumprimenta pelo primeiro nome, sem caixa alta");
ok(aviso.telegram.includes("/portal"), "Telegram diz para enviar /portal");
ok(aviso.texto.includes(BOT_DO_RH) && aviso.texto.includes("/portal"), "e-mail diz qual bot e o /portal");
ok(aviso.html.includes(BOT_DO_RH) && aviso.html.includes("/portal"), "HTML idem");
ok(aviso.telegram.includes("LM Telecom") && aviso.texto.includes("LM Telecom"), "assina pela marca");
ok(aviso.assunto === "O RH respondeu a sua mensagem", "assunto curto e neutro");
ok(aviso.telegram.length < 300, "Telegram curto");

const semNome = montarAvisoDeResposta("   ", "LM Telecom");
ok(semNome.telegram.includes("Olá!"), "sem nome: cumprimento genérico");

const marcaComHtml = montarAvisoDeResposta("Ana", "A&B <Ltda>");
ok(marcaComHtml.html.includes("A&amp;B &lt;Ltda&gt;") && !marcaComHtml.html.includes("<Ltda>"), "marca escapada no HTML");

// A assinatura só recebe nome e marca: não há como a resposta vazar no aviso.
ok(montarAvisoDeResposta.length === 2, "a função não recebe a mensagem nem a resposta");

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
