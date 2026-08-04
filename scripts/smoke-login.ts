// Fumaça do limite de login contra o banco de verdade, em transação com
// rollback proposital. Nada fica gravado.
//
//   npx tsx scripts/smoke-login.ts
//
// O que este teste cobre e o `test-login-tentativas.ts` não: a ida e volta ao
// Postgres. As regras da janela são puras e já estão testadas sem banco — aqui
// a pergunta é se a consulta filtra pelo par usuário+IP certo, se a
// normalização do nome vale no `where` além de valer no `create`, e se limpar
// o balde de um usuário não derruba o do vizinho.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  estadoDoLogin,
  registrarFalha,
  limparTentativas,
  MAX_TENTATIVAS,
} from "../lib/login-tentativas";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

// Nomes que não existem no cadastro de propósito: tentativa de usuário
// inexistente é justamente o caso que a tabela precisa contar.
const USUARIO = `smoke-login-${process.pid}`;
const VIZINHO = `smoke-vizinho-${process.pid}`;
const IP = "203.0.113.42";
const OUTRO_IP = "198.51.100.7";

async function main() {
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  await prisma
    .$transaction(async (tx) => {
      console.log("Contagem por usuário + IP\n");

      const zerado = await estadoDoLogin(USUARIO, IP, new Date(), tx);
      ok(zerado.bloqueado === false, "usuário novo entra sem bloqueio");
      ok(zerado.restantes === MAX_TENTATIVAS, `e com ${MAX_TENTATIVAS} tentativas na mão`);

      for (let i = 0; i < MAX_TENTATIVAS - 1; i++) await registrarFalha(USUARIO, IP, tx);
      const quaseLa = await estadoDoLogin(USUARIO, IP, new Date(), tx);
      ok(quaseLa.bloqueado === false, `${MAX_TENTATIVAS - 1} falhas gravadas ainda passam`);
      ok(quaseLa.restantes === 1, "e sobra exatamente 1");

      await registrarFalha(USUARIO, IP, tx);
      const bloqueado = await estadoDoLogin(USUARIO, IP, new Date(), tx);
      ok(bloqueado.bloqueado === true, `a ${MAX_TENTATIVAS}ª falha bloqueia`);
      ok(bloqueado.liberaEm !== null, "e o banco devolve quando libera");

      console.log("\nUm balde não vaza no outro\n");

      const doOutroIp = await estadoDoLogin(USUARIO, OUTRO_IP, new Date(), tx);
      ok(doOutroIp.bloqueado === false, "mesmo usuário, IP diferente: balde separado");

      const doVizinho = await estadoDoLogin(VIZINHO, IP, new Date(), tx);
      ok(doVizinho.bloqueado === false, "mesmo IP, usuário diferente: balde separado");

      console.log("\nNome normalizado no where, não só no create\n");

      const comEspacoEMaiuscula = await estadoDoLogin(`  ${USUARIO.toUpperCase()}  `, IP, new Date(), tx);
      ok(
        comEspacoEMaiuscula.bloqueado === true,
        "digitar com espaço e maiúscula cai no mesmo balde já bloqueado",
      );

      console.log("\nEntrar zera o balde\n");

      await registrarFalha(VIZINHO, IP, tx);
      await limparTentativas(USUARIO, IP, tx);
      const depoisDeEntrar = await estadoDoLogin(USUARIO, IP, new Date(), tx);
      ok(depoisDeEntrar.bloqueado === false, "senha certa destrava na hora");
      ok(depoisDeEntrar.restantes === MAX_TENTATIVAS, "e devolve o balde cheio");

      const vizinhoIntacto = await estadoDoLogin(VIZINHO, IP, new Date(), tx);
      ok(
        vizinhoIntacto.restantes === MAX_TENTATIVAS - 1,
        "e não apaga a falha do vizinho no mesmo IP",
      );

      throw new RollbackProposital();
    })
    .catch((e) => {
      if (!(e instanceof RollbackProposital)) throw e;
    });

  console.log(falhas === 0 ? "\nTudo certo. (rollback feito)" : `\n${falhas} falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
