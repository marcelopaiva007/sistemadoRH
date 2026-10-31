// Fumaça de lib/usuario-por-identificador.ts contra o Postgres de verdade — a
// regra de "qual conta a pessoa quis dizer" do login e do "Esqueci minha
// senha". Precisa de banco porque o que importa aqui é o `mode: "insensitive"`
// do Postgres e os índices únicos que diferenciam maiúsculas; um dublê em
// memória só testaria a minha própria imitação deles. Em transação com
// rollback proposital: nada fica gravado.
//
//   npx tsx scripts/smoke-identificador-login.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { campoDoIdentificador, usuarioPorIdentificador } from "../lib/usuario-por-identificador";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok — ${mensagem}`);
}

async function main() {
  conferir(campoDoIdentificador("fulano@empresa.com") === "email", "texto com @ é e-mail");
  conferir(campoDoIdentificador("fulano") === "username", "texto sem @ é usuário");

  const sfx = Date.now().toString(36);
  try {
    await prisma.$transaction(async (tx) => {
      const base = { nome: "Smoke login", passwordHash: "x", role: "RH_MANAGER" };
      const fulano = await tx.user.create({
        data: { ...base, username: `Smoke.Login.${sfx}`, email: `Fulano.${sfx}@Empresa.com` },
      });
      const maiusculo = await tx.user.create({ data: { ...base, username: `DUP.${sfx}` } });
      await tx.user.create({ data: { ...base, username: `dup.${sfx}` } });

      const achar = (texto: string, campo?: "email" | "username") =>
        usuarioPorIdentificador(texto, campo, tx).then((u) => u?.id ?? null);

      console.log("Login por usuário");
      conferir((await achar(`Smoke.Login.${sfx}`)) === fulano.id, "usuário exato entra");
      conferir((await achar(`smoke.login.${sfx}`)) === fulano.id, "maiúsculas não importam");
      conferir((await achar(`  Smoke.Login.${sfx} `)) === fulano.id, "espaços nas pontas não importam");
      conferir((await achar(`smoke.login.${sfx}x`)) === null, "usuário que não existe não entra");
      conferir((await achar("   ")) === null, "só espaço não é ninguém");

      console.log("Login por e-mail");
      conferir((await achar(`Fulano.${sfx}@Empresa.com`)) === fulano.id, "e-mail exato entra");
      conferir(
        (await achar(`fulano.${sfx}@empresa.com`)) === fulano.id,
        "e-mail em minúsculas acha o cadastro com maiúsculas",
      );

      console.log("Recuperação de senha (sempre por e-mail)");
      conferir(
        (await achar(`fulano.${sfx}@empresa.com`, "email")) === fulano.id,
        "o caso de 30/10: e-mail cadastrado com maiúsculas recebe o link",
      );
      conferir((await achar(`Smoke.Login.${sfx}`, "email")) === null, "nome de usuário não serve como e-mail");

      console.log("Cadastros que diferem só em maiúsculas");
      conferir((await achar(`DUP.${sfx}`)) === maiusculo.id, "o texto exato vence");
      conferir((await achar(`Dup.${sfx}`)) === null, "sem exato e com dois candidatos, ninguém entra");

      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }
  console.log("\nTudo certo (nada gravado).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
