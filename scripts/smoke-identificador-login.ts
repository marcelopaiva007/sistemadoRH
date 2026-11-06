// Fumaça de lib/usuario-por-identificador.ts contra o Postgres de verdade — a
// regra de "qual conta a pessoa quis dizer" do login, do "Esqueci minha senha"
// e do "Esqueci meu usuário". Precisa de banco porque o que importa aqui é o
// `mode: "insensitive"` do Postgres (que vira ILIKE, com coringas) e os índices
// que diferenciam maiúsculas; um dublê em memória só testaria a minha própria
// imitação deles. Em transação com rollback proposital: nada fica gravado.
//
// Desde a v1.191.0 o acesso é SÓ pelo nome de usuário, cada usuário é de um
// grupo, e quem trabalha nos dois tem dois usuários com o MESMO e-mail — o que
// só é possível porque o e-mail deixou de ser único (migration
// 20261105230000_user_email_contato).
//
//   npx tsx scripts/smoke-identificador-login.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loginJaUsado, pareceEmail, usuarioPorLogin, usuariosPorEmail } from "../lib/usuario-por-identificador";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok — ${mensagem}`);
}

async function main() {
  conferir(pareceEmail("fulano@empresa.com"), "texto com @ parece e-mail");
  conferir(!pareceEmail("fulano.lm"), "texto sem @ é usuário");

  const sfx = Date.now().toString(36);
  try {
    await prisma.$transaction(async (tx) => {
      const grupoDemais = await tx.grupo.create({ data: { nome: `Smoke Demais ${sfx}` } });
      const grupoLm = await tx.grupo.create({ data: { nome: `Smoke LM ${sfx}` } });
      const base = { nome: "Smoke login", passwordHash: "x", role: "RH_MANAGER" };
      const emailDaPessoa = `Fulano.${sfx}@Empresa.com`;

      const fulano = await tx.user.create({
        data: { ...base, username: `Smoke.Login.${sfx}`, email: emailDaPessoa, grupoId: grupoDemais.id },
      });
      // A MESMA pessoa no outro grupo, com o MESMO e-mail (só a caixa muda).
      const fulanoLm = await tx.user.create({
        data: { ...base, username: `smoke.login.${sfx}.lm`, email: emailDaPessoa.toLowerCase(), grupoId: grupoLm.id },
      });
      const inativo = await tx.user.create({
        data: { ...base, username: `inativo.${sfx}`, email: emailDaPessoa, ativo: false },
      });
      const portal = await tx.user.create({
        data: { ...base, role: "COLABORADOR", username: `colaborador.smoke${sfx}`, email: emailDaPessoa },
      });
      const maiusculo = await tx.user.create({ data: { ...base, username: `DUP.${sfx}` } });
      await tx.user.create({ data: { ...base, username: `dup.${sfx}` } });
      // Usuário de antes da v1.191.0 com "@" no próprio nome de usuário.
      const comArroba = await tx.user.create({ data: { ...base, username: `antigo.${sfx}@empresa.com` } });

      const achar = (texto: string) => usuarioPorLogin(texto, tx).then((u) => u?.id ?? null);

      console.log("Login por usuário");
      conferir((await achar(`Smoke.Login.${sfx}`)) === fulano.id, "usuário exato entra");
      conferir((await achar(`smoke.login.${sfx}`)) === fulano.id, "maiúsculas não importam");
      conferir((await achar(`  Smoke.Login.${sfx} `)) === fulano.id, "espaços nas pontas não importam");
      conferir((await achar(`smoke.login.${sfx}x`)) === null, "usuário que não existe não entra");
      conferir((await achar("   ")) === null, "só espaço não é ninguém");
      conferir((await achar(`smoke_login.${sfx}`)) === null, "“_” não funciona como coringa");

      console.log("O e-mail não entra mais");
      conferir((await achar(emailDaPessoa)) === null, "o e-mail da pessoa não acha conta nenhuma");
      conferir((await achar(emailDaPessoa.toLowerCase())) === null, "…nem em minúsculas");
      conferir(
        (await achar(`antigo.${sfx}@empresa.com`)) === comArroba.id,
        "usuário antigo com “@” no próprio nome continua entrando",
      );

      console.log("Um usuário por grupo");
      conferir((await achar(`smoke.login.${sfx}.lm`)) === fulanoLm.id, "o usuário .lm entra na conta do grupo LM");
      conferir((await achar(`SMOKE.LOGIN.${sfx}`)) === fulano.id, "…e o sem sufixo, na do outro grupo");

      console.log("Esqueci meu usuário (por e-mail)");
      const lista = await usuariosPorEmail(`FULANO.${sfx}@empresa.com`, tx);
      const ids = lista.map((u) => u.id).sort();
      conferir(
        JSON.stringify(ids) === JSON.stringify([fulano.id, fulanoLm.id].sort()),
        "o e-mail traz os dois usuários da pessoa, sem diferença de maiúsculas",
      );
      conferir(!ids.includes(inativo.id), "conta desativada fica de fora");
      conferir(!ids.includes(portal.id), "acesso de portal (sem login) fica de fora");
      conferir(
        lista.find((u) => u.id === fulanoLm.id)?.grupo?.nome === grupoLm.nome,
        "cada usuário vem com o nome do grupo, para o e-mail dizer qual é qual",
      );
      conferir((await usuariosPorEmail(`fulano_${sfx}@empresa.com`, tx)).length === 0, "“_” no e-mail não é coringa");
      conferir((await usuariosPorEmail(`fulano.${sfx}`, tx)).length === 0, "texto sem @ não é e-mail");
      conferir((await usuariosPorEmail(`ninguem.${sfx}@empresa.com`, tx)).length === 0, "e-mail sem conta: lista vazia");

      console.log("Usuário não se repete (loginJaUsado)");
      conferir((await loginJaUsado(`SMOKE.LOGIN.${sfx}`, undefined, tx))?.id === fulano.id, "maiúsculas não fazem outro usuário");
      conferir(
        (await loginJaUsado(`smoke.login.${sfx}`, undefined, tx))?.grupoNome === grupoDemais.nome,
        "diz em que grupo está o usuário que já existe",
      );
      conferir((await loginJaUsado(`smoke.login.${sfx}`, fulano.id, tx)) === null, "a própria conta não conta, na edição");
      conferir((await loginJaUsado(`smoke_login.${sfx}`, undefined, tx)) === null, "“_” não é coringa");
      conferir((await loginJaUsado(`livre.${sfx}`, undefined, tx)) === null, "usuário livre está livre");

      console.log("Cadastros antigos que diferem só em maiúsculas");
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
