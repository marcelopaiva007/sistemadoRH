// Limite de envios por IP nas telas públicas (inscrição em vaga e resposta de
// pesquisa), sem banco nenhum — 25/11/2026.
//
//   npx tsx scripts/test-limite-publico.ts
//
// O que pode quebrar sozinho é a aritmética: barrar o 5º em vez do 6º, contar
// envio de ontem, ou o teto da pesquisa ficar igual ao da vaga.
import {
  limiteEstourado,
  LIMITE_INSCRICAO_VAGA,
  LIMITE_RESPOSTA_PESQUISA,
} from "../lib/limite-publico";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const AGORA = new Date("2026-11-25T12:00:00.000Z");
const atras = (min: number) => new Date(AGORA.getTime() - min * 60_000);
/** `n` envios, um a cada `passo` minutos, o mais novo `desde` minutos atrás. */
const envios = (n: number, passo = 1, desde = 0) => Array.from({ length: n }, (_, i) => atras(desde + i * passo));

console.log("Valores combinados\n");
{
  ok(LIMITE_INSCRICAO_VAGA.maximo === 5 && LIMITE_INSCRICAO_VAGA.janelaMinutos === 60, "vaga: 5 por hora");
  ok(LIMITE_RESPOSTA_PESQUISA.maximo === 30 && LIMITE_RESPOSTA_PESQUISA.janelaMinutos === 60, "pesquisa: 30 por hora");
  ok(LIMITE_INSCRICAO_VAGA.chave !== LIMITE_RESPOSTA_PESQUISA.chave, "baldes separados (chaves diferentes)");
  ok(
    !LIMITE_INSCRICAO_VAGA.chave.startsWith("ponto-pin") && !LIMITE_INSCRICAO_VAGA.chave.startsWith("reset:"),
    "chave não colide com os prefixos do ponto e do esqueci-senha",
  );
}

console.log("\nInscrição em vaga (o envio atual já está na lista)\n");
{
  const L = LIMITE_INSCRICAO_VAGA;
  ok(!limiteEstourado(envios(1), AGORA, L), "1º envio passa");
  ok(!limiteEstourado(envios(5), AGORA, L), "5º envio na hora passa");
  ok(limiteEstourado(envios(6), AGORA, L), "6º envio na hora é barrado");
  ok(limiteEstourado(envios(6, 0), AGORA, L), "rajada de 6 no mesmo instante: o 6º é barrado");
  ok(!limiteEstourado([...envios(5, 1, 61), atras(0)], AGORA, L), "envios de mais de uma hora atrás não contam");
  ok(!limiteEstourado([...envios(5, 1, 60), atras(0)], AGORA, L), "envio de exatamente 60 min atrás já saiu da janela");
  ok(limiteEstourado([...envios(5, 1, 55), atras(0)], AGORA, L), "5 envios nos últimos 59 min + o atual: barrado");
  ok(!limiteEstourado([new Date(AGORA.getTime() + 60_000), ...envios(5)], AGORA, L), "horário no futuro não entra na conta");
  ok(!limiteEstourado([], AGORA, L), "lista vazia passa");
}

console.log("\nResposta de pesquisa\n");
{
  const L = LIMITE_RESPOSTA_PESQUISA;
  ok(!limiteEstourado(envios(30), AGORA, L), "30º envio na hora passa (loja inteira no mesmo Wi-Fi)");
  ok(limiteEstourado(envios(31), AGORA, L), "31º envio na hora é barrado");
  ok(!limiteEstourado(envios(31, 2), AGORA, L), "31 envios espalhados em 62 min: o mais velho saiu, passa");
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
