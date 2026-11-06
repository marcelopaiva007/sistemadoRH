// Fumaça do LOGIN POR ENDEREÇO DO CLIENTE (v1.198.0) contra o Postgres de
// verdade: os índices novos (grupoId + username; username único entre as
// contas sem cliente) e a regra de "onde procurar" do login.
// Em transação com rollback proposital: nada fica gravado.
//
//   npx tsx scripts/smoke-login-por-endereco.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loginJaUsado, usuarioPorLogin } from "../lib/usuario-por-identificador";
import { clientePorHost, dominioDigitado, normalizarHost } from "../lib/endereco-cliente";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok — ${mensagem}`);
}

async function main() {
  console.log("\nEndereço digitado pelo administrador\n");
  conferir(dominioDigitado("https://RH.Cliente.com.br/login") === "rh.cliente.com.br", "aceita colar a URL inteira");
  conferir(dominioDigitado("") === null, "vazio = sem endereço próprio");
  conferir(dominioDigitado("não é endereço") === false, "texto que não é endereço é recusado");
  conferir(normalizarHost("rh.cliente.com.br:443") === "rh.cliente.com.br", "porta sai do host");

  const sfx = Date.now().toString(36);
  const base = { nome: "Smoke endereço", passwordHash: "x", role: "RH_MANAGER" };

  console.log("\nÍndices do banco\n");
  // Um erro de índice aborta a transação inteira no Postgres: cada caso que
  // PROVOCA erro roda na sua própria transação, e termina nele.
  async function indiceRecusa(montar: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>) {
    let recusou = false;
    try {
      await prisma.$transaction(async (tx) => {
        try {
          await montar(tx);
        } catch {
          recusou = true;
        }
        throw new RollbackProposital();
      });
    } catch (e) {
      if (!(e instanceof RollbackProposital)) throw e;
    }
    return recusou;
  }
  conferir(
    !(await indiceRecusa(async (tx) => {
      const a = await tx.grupo.create({ data: { nome: `Idx A ${sfx}` } });
      const b = await tx.grupo.create({ data: { nome: `Idx B ${sfx}` } });
      await tx.user.create({ data: { ...base, username: `ana.${sfx}`, grupoId: a.id } });
      await tx.user.create({ data: { ...base, username: `ana.${sfx}`, grupoId: b.id } });
    })),
    "o banco aceita o mesmo login em dois clientes",
  );
  conferir(
    await indiceRecusa(async (tx) => {
      const a = await tx.grupo.create({ data: { nome: `Idx C ${sfx}` } });
      await tx.user.create({ data: { ...base, username: `ana.${sfx}`, grupoId: a.id } });
      await tx.user.create({ data: { ...base, username: `ana.${sfx}`, grupoId: a.id } });
    }),
    "o banco recusa o mesmo login duas vezes no MESMO cliente",
  );
  conferir(
    await indiceRecusa(async (tx) => {
      await tx.user.create({ data: { ...base, username: `semcliente.${sfx}` } });
      await tx.user.create({ data: { ...base, username: `semcliente.${sfx}` } });
    }),
    "o banco recusa o mesmo login entre contas SEM cliente (índice parcial)",
  );
  conferir(
    await indiceRecusa(async (tx) => {
      await tx.grupo.create({ data: { nome: `Idx D ${sfx}`, dominio: `d-${sfx}.smoke.test` } });
      await tx.grupo.create({ data: { nome: `Idx E ${sfx}`, dominio: `d-${sfx}.smoke.test` } });
    }),
    "o banco recusa o mesmo endereço em dois clientes",
  );

  try {
    await prisma.$transaction(async (tx) => {
      const dominioA = `a-${sfx}.smoke.test`;
      const dominioB = `b-${sfx}.smoke.test`;
      const clienteA = await tx.grupo.create({ data: { nome: `Smoke A ${sfx}`, dominio: dominioA } });
      const clienteB = await tx.grupo.create({ data: { nome: `Smoke B ${sfx}`, dominio: dominioB } });
      const comum1 = await tx.grupo.create({ data: { nome: `Smoke Comum1 ${sfx}` } });
      const comum2 = await tx.grupo.create({ data: { nome: `Smoke Comum2 ${sfx}` } });
      const login = `maria.${sfx}`;
      const mariaA = await tx.user.create({ data: { ...base, username: login, grupoId: clienteA.id } });
      const mariaB = await tx.user.create({ data: { ...base, username: login, grupoId: clienteB.id } });
      const joaoComum = await tx.user.create({ data: { ...base, username: `joao.${sfx}`, grupoId: comum1.id } });

      console.log("\nQual cliente cada endereço representa\n");
      conferir((await clientePorHost(dominioA.toUpperCase(), tx))?.id === clienteA.id, "endereço A acha o cliente A (sem diferença de maiúsculas)");
      conferir((await clientePorHost("rh.endereco-comum.test", tx)) === null, "endereço sem cliente = endereço comum");

      console.log("\nLogin procurado no lugar certo\n");
      const achar = (t: string, onde?: Parameters<typeof usuarioPorLogin>[2]) =>
        usuarioPorLogin(t, tx, onde).then((u) => u?.id ?? null);
      conferir((await achar(login, { grupoId: clienteA.id })) === mariaA.id, "no endereço A, \"maria\" é a maria do cliente A");
      conferir((await achar(login, { grupoId: clienteB.id })) === mariaB.id, "no endereço B, \"maria\" é a maria do cliente B");
      conferir((await achar(login.toUpperCase(), { grupoId: clienteB.id })) === mariaB.id, "sem diferença de maiúsculas, dentro do cliente");
      conferir((await achar(login, "comum")) === null, "no endereço comum, ninguém (os dois clientes têm endereço próprio)");
      conferir((await achar(login)) === null, "sem dizer onde e com dois donos: ninguém (nunca a conta errada)");
      conferir((await achar(`joao.${sfx}`, "comum")) === joaoComum.id, "cliente sem endereço próprio entra pelo comum");
      conferir((await achar(`joao.${sfx}`, { grupoId: clienteA.id })) === null, "…e não entra pelo endereço de outro cliente");

      console.log("\nQuando o login já está em uso\n");
      conferir((await loginJaUsado(login, undefined, tx, clienteA.id)) !== null, "repetir no mesmo cliente: em uso");
      const nova = await tx.grupo.create({ data: { nome: `Smoke C ${sfx}`, dominio: `c-${sfx}.smoke.test` } });
      conferir((await loginJaUsado(login, undefined, tx, nova.id)) === null, "outro cliente com endereço próprio: livre");
      conferir((await loginJaUsado(`joao.${sfx}`, undefined, tx, comum2.id)) !== null, "dois clientes do endereço comum: em uso (o login ali ficaria ambíguo)");
      conferir((await loginJaUsado(`joao.${sfx}`, undefined, tx, nova.id)) === null, "cliente com endereço próprio pode usar um login do comum");
      conferir((await loginJaUsado(login, undefined, tx)) !== null, "sem cliente informado: regra antiga, único no sistema todo");
      conferir((await loginJaUsado(login, mariaA.id, tx, clienteA.id)) === null, "a própria conta não conta como repetida");

      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }
  console.log("\nTudo certo — nada ficou gravado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
