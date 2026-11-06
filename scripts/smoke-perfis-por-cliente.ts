// Fumaça dos PERFIS POR CLIENTE (v1.199.0) contra o Postgres de verdade:
// a cópia dos modelos FASTMAI para um cliente, o id derivado (o mesmo que a
// migration 20261106220000_perfis_por_cliente gera em SQL) e o nome único
// por cliente. Em transação com rollback proposital: nada fica gravado.
//
//   npx tsx scripts/smoke-perfis-por-cliente.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { copiarModelosParaCliente, idDaCopia } from "../lib/perfis-cliente";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok — ${mensagem}`);
}

async function main() {
  const sfx = Date.now().toString(36);
  try {
    await prisma.$transaction(async (tx) => {
      const modelo = await tx.perfil.create({
        data: { nome: `Modelo smoke ${sfx}`, grants: "rh:*:*", sistema: true },
      });
      const clienteA = await tx.grupo.create({ data: { nome: `Perfis A ${sfx}` } });
      const clienteB = await tx.grupo.create({ data: { nome: `Perfis B ${sfx}` } });

      console.log("\nCópia dos modelos para o cliente\n");
      const copiadosA = await copiarModelosParaCliente(clienteA.id, tx);
      conferir(copiadosA >= 1, "cliente recebe cópia dos modelos");
      const copia = await tx.perfil.findUnique({ where: { id: idDaCopia(modelo.id, clienteA.id) } });
      conferir(copia?.grupoId === clienteA.id, "a cópia é do cliente, com o id derivado");
      conferir(copia?.grants === modelo.grants && copia?.sistema === modelo.sistema, "mesmas permissões e mesmo \"padrão\" do modelo");
      const [sql] = await tx.$queryRaw<{ id: string }[]>`SELECT 'pc_' || md5(${modelo.id} || ':' || ${clienteA.id}) AS id`;
      conferir(sql.id === idDaCopia(modelo.id, clienteA.id), "o id em TypeScript é o mesmo que a migration gera em SQL");
      conferir((await copiarModelosParaCliente(clienteA.id, tx)) === 0, "copiar de novo não duplica");

      console.log("\nCada cliente ajusta o seu sem afetar o outro\n");
      await copiarModelosParaCliente(clienteB.id, tx);
      await tx.perfil.update({ where: { id: idDaCopia(modelo.id, clienteA.id) }, data: { grants: "rh:setor:ver" } });
      const copiaB = await tx.perfil.findUnique({ where: { id: idDaCopia(modelo.id, clienteB.id) } });
      const modeloDepois = await tx.perfil.findUnique({ where: { id: modelo.id } });
      conferir(copiaB?.grants === "rh:*:*", "editar a cópia do cliente A não muda a do cliente B");
      conferir(modeloDepois?.grants === "rh:*:*", "…nem o modelo");

      console.log("\nNome único por cliente\n");
      const outro = await tx.grupo.create({ data: { nome: `Perfis C ${sfx}` } });
      await tx.perfil.create({ data: { nome: `Financeiro ${sfx}`, grants: "rh:*:*", grupoId: clienteA.id } });
      await tx.perfil.create({ data: { nome: `Financeiro ${sfx}`, grants: "rh:*:*", grupoId: outro.id } });
      conferir(true, "o mesmo nome de perfil em dois clientes é aceito");
      const nomeOcupado = await tx.perfil.create({
        data: { nome: `Financeiro ${sfx}`, grants: "rh:*:*", grupoId: clienteB.id },
      });
      conferir(
        (await copiarModelosParaCliente(clienteB.id, tx)) === 0 && !!nomeOcupado,
        "cliente que já tem tudo não recebe nada a mais",
      );

      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }

  console.log("\nÍndice: mesmo nome duas vezes no MESMO cliente\n");
  let recusou = false;
  try {
    await prisma.$transaction(async (tx) => {
      const g = await tx.grupo.create({ data: { nome: `Perfis D ${sfx}` } });
      try {
        await tx.perfil.create({ data: { nome: `Dup ${sfx}`, grants: "rh:*:*", grupoId: g.id } });
        await tx.perfil.create({ data: { nome: `Dup ${sfx}`, grants: "rh:*:*", grupoId: g.id } });
      } catch {
        recusou = true;
      }
      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }
  conferir(recusou, "o banco recusa");

  console.log("\nTudo certo — nada ficou gravado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
