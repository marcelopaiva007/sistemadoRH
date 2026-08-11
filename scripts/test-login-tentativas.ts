// Regras da janela deslizante do limite de login, sem banco nenhum.
//
//   npx tsx scripts/test-login-tentativas.ts
//
// Roda em qualquer máquina e dentro do CI, que não tem base populada — por
// isso `avaliarTentativas` foi escrita pura. O que quebra sozinho aqui é
// aritmética de janela: contar uma falha a mais, liberar cedo demais, ou
// esticar o bloqueio a cada tentativa barrada (que é o jeito de transformar
// 15 minutos em bloqueio permanente sem ninguém perceber).
import {
  avaliarTentativas,
  minutosAteLiberar,
  normalizarUsuario,
  ipDaRequisicao,
  MAX_TENTATIVAS,
  JANELA_MINUTOS,
} from "../lib/login-tentativas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const AGORA = new Date("2026-08-04T12:00:00.000Z");
/** Um instante `min` minutos antes de AGORA. */
const atras = (min: number) => new Date(AGORA.getTime() - min * 60_000);
/** `n` falhas seguidas, uma por minuto, terminando `desde` minutos atrás. */
const seguidas = (n: number, desde = 0) =>
  Array.from({ length: n }, (_, i) => atras(desde + i));

console.log("Contagem dentro da janela\n");
{
  ok(avaliarTentativas([], AGORA).bloqueado === false, "sem falha nenhuma, passa");
  ok(
    avaliarTentativas([], AGORA).restantes === MAX_TENTATIVAS,
    `sem falha, restam ${MAX_TENTATIVAS} tentativas`,
  );

  const quaseLa = avaliarTentativas(seguidas(MAX_TENTATIVAS - 1), AGORA);
  ok(quaseLa.bloqueado === false, `${MAX_TENTATIVAS - 1} falhas ainda passam`);
  ok(quaseLa.restantes === 1, "e sobra exatamente 1 tentativa");

  const noLimite = avaliarTentativas(seguidas(MAX_TENTATIVAS), AGORA);
  ok(noLimite.bloqueado === true, `${MAX_TENTATIVAS} falhas bloqueiam`);
  ok(noLimite.restantes === 0, "e não sobra tentativa");
  ok(noLimite.liberaEm !== null, "bloqueio bloqueado sempre diz quando libera");

  // Vinte e cinco tentativas no mesmo instante: as 20 excedentes são
  // descartadas, mas as 5 que contam seguem na janela.
  const enxurrada = Array.from({ length: 25 }, () => atras(1));
  ok(
    avaliarTentativas(enxurrada, AGORA).bloqueado === true,
    "enxurrada dentro da janela continua bloqueada (não dá a volta no contador)",
  );
}

console.log("\nFalha velha sai da conta\n");
{
  // Todas as falhas antes da janela: nenhuma conta.
  const velhas = seguidas(MAX_TENTATIVAS, JANELA_MINUTOS + 1);
  ok(
    avaliarTentativas(velhas, AGORA).bloqueado === false,
    `${MAX_TENTATIVAS} falhas mais velhas que ${JANELA_MINUTOS} min não bloqueiam`,
  );
  ok(
    avaliarTentativas(velhas, AGORA).restantes === MAX_TENTATIVAS,
    "e o balde volta cheio",
  );

  // Exatamente na borda: `criadoEm > início da janela`, então a falha que faz
  // JANELA_MINUTOS cravados já saiu.
  const naBorda = Array.from({ length: MAX_TENTATIVAS }, () => atras(JANELA_MINUTOS));
  ok(
    avaliarTentativas(naBorda, AGORA).bloqueado === false,
    `falha de exatamente ${JANELA_MINUTOS} min atrás já saiu da janela`,
  );

  // Metade velha, metade nova: só a metade nova conta.
  const misturadas = [...seguidas(3, JANELA_MINUTOS + 5), ...seguidas(3)];
  ok(
    avaliarTentativas(misturadas, AGORA).bloqueado === false,
    "3 velhas + 3 novas não somam 6 — só as novas contam",
  );
}

console.log("\nQuando libera\n");
{
  // 5 falhas, a mais antiga do lote 2 min atrás: libera 2 min atrás + janela.
  const lote = seguidas(MAX_TENTATIVAS, 0); // 0,1,2,3,4 min atrás
  const estado = avaliarTentativas(lote, AGORA);
  const maisAntigaQueSegura = atras(MAX_TENTATIVAS - 1);
  ok(
    estado.liberaEm?.getTime() ===
      maisAntigaQueSegura.getTime() + JANELA_MINUTOS * 60_000,
    "libera pela falha mais ANTIGA do lote, não pela mais recente",
  );

  // Tentar de novo enquanto bloqueado não pode empurrar a liberação. Uma
  // tentativa barrada agora entra como falha mais recente — se `liberaEm`
  // olhasse para a última falha, o bloqueio se renovaria para sempre.
  const comTentativaNova = [...lote, AGORA];
  ok(
    avaliarTentativas(comTentativaNova, AGORA).liberaEm?.getTime() ===
      estado.liberaEm?.getTime(),
    "insistir enquanto bloqueado NÃO estica o bloqueio",
  );

  // O caso que dá o nó: atingiu o limite 24 min atrás e ficou martelando
  // durante todo o bloqueio, parando 10 min atrás. Se as tentativas barradas
  // contassem, cada uma teria empurrado a soltura para frente e a pessoa
  // continuaria presa agora — presa por ter insistido, não por ter errado.
  const martelouEnquantoBloqueado = [
    ...seguidas(MAX_TENTATIVAS, 20), // as 5 que de fato contaram
    ...Array.from({ length: 10 }, (_, i) => atras(10 + i)), // barradas, não contam
  ];
  ok(
    avaliarTentativas(martelouEnquantoBloqueado, AGORA).bloqueado === false,
    `bloqueio solta ${JANELA_MINUTOS} min depois de ser atingido, mesmo tendo martelado durante`,
  );

  // A contrapartida: parar de contar tentativa barrada não é perdão. Quem
  // errou 5 vezes de verdade nos últimos 15 min está bloqueado, ponto.
  ok(
    avaliarTentativas(
      [...seguidas(MAX_TENTATIVAS, 20), ...seguidas(MAX_TENTATIVAS, 1)],
      AGORA,
    ).bloqueado === true,
    "errar 5 vezes de novo depois do bloqueio soltar bloqueia de novo",
  );

  ok(
    minutosAteLiberar(new Date(AGORA.getTime() + 60_000), AGORA) === 1,
    "1 minuto restante conta como 1",
  );
  ok(
    minutosAteLiberar(new Date(AGORA.getTime() + 1_000), AGORA) === 1,
    "resto de segundos arredonda para 1 minuto, nunca para 0",
  );
  ok(
    minutosAteLiberar(new Date(AGORA.getTime() + 14 * 60_000 + 30_000), AGORA) === 15,
    "14min30s viram 15 minutos, não 14",
  );
}

console.log("\nChave do balde\n");
{
  ok(normalizarUsuario("  Marcelo  ") === "marcelo", "espaço e maiúscula caem no mesmo balde");
  ok(normalizarUsuario("marcelo") === "marcelo", "nome já normalizado não muda");

  const comProxy = new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" });
  ok(ipDaRequisicao(comProxy) === "203.0.113.9", "x-forwarded-for usa o primeiro da lista");

  const semProxy = new Headers({ "x-real-ip": "198.51.100.7" });
  ok(ipDaRequisicao(semProxy) === "198.51.100.7", "sem x-forwarded-for, cai no x-real-ip");

  ok(
    ipDaRequisicao(new Headers()) === "desconhecido",
    "sem cabeçalho nenhum, todo mundo cai no mesmo balde",
  );
}

console.log(
  falhas === 0 ? "\nTudo certo." : `\n${falhas} verificação(ões) falharam.`,
);
process.exit(falhas === 0 ? 0 : 1);
