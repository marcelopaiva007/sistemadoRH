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
  ok(LIMITE_INSCRICAO_VAGA.maximo === 20 && LIMITE_INSCRICAO_VAGA.janelaMinutos === 60, "vaga: 20 por hora");
  ok(LIMITE_RESPOSTA_PESQUISA.maximo === 300 && LIMITE_RESPOSTA_PESQUISA.janelaMinutos === 60, "pesquisa: 300 por hora");
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
  ok(!limiteEstourado(envios(L.maximo), AGORA, L), "o último envio permitido na hora passa");
  ok(limiteEstourado(envios(L.maximo + 1), AGORA, L), "o envio seguinte na hora é barrado");
  ok(limiteEstourado(envios(L.maximo + 1, 0), AGORA, L), "rajada no mesmo instante: o excedente é barrado");
  ok(!limiteEstourado([...envios(L.maximo, 1, 61), atras(0)], AGORA, L), "envios de mais de uma hora atrás não contam");
  ok(!limiteEstourado([...envios(L.maximo, 1, 60), atras(0)], AGORA, L), "envio de exatamente 60 min atrás já saiu da janela");
  ok(limiteEstourado([...envios(L.maximo, 0, 55), atras(0)], AGORA, L), "teto cheio nos últimos 55 min + o atual: barrado");
  ok(!limiteEstourado([new Date(AGORA.getTime() + 60_000), ...envios(L.maximo)], AGORA, L), "horário no futuro não entra na conta");
  ok(!limiteEstourado([], AGORA, L), "lista vazia passa");
}

console.log("\nResposta de pesquisa\n");
{
  const L = LIMITE_RESPOSTA_PESQUISA;
  ok(!limiteEstourado(envios(L.maximo, 0), AGORA, L), "o último envio permitido na hora passa (loja inteira no mesmo Wi-Fi)");
  ok(limiteEstourado(envios(L.maximo + 1, 0), AGORA, L), "o envio seguinte na hora é barrado");
  ok(!limiteEstourado(envios(31, 2), AGORA, L), "31 envios espalhados em 62 min: o mais velho saiu, passa");
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
