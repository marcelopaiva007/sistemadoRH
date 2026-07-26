// Fumaça da Fase 6 (marca → CNPJ) contra o banco de verdade. Em transação com
// rollback proposital: marca nova, dois CNPJs sob a mesma marca, o índice único
// que impede repetir CNPJ, a troca de um CNPJ de marca e a garantia de que o
// colaborador continua preso ao CNPJ, não à marca. Nada fica gravado.
//
//   npx tsx scripts/smoke-estrutura.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cnpjValido, apenasDigitosCnpj, formatarCnpj } from "../lib/cnpj";
import { violouUnique } from "../lib/prisma-erros";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

function conferir(condicao: boolean, mensagem: string) {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok — ${mensagem}`);
}

// CNPJs reais e públicos, usados só como par de números válidos distintos.
const CNPJ_A = apenasDigitosCnpj("33.000.167/0001-01");
const CNPJ_B = apenasDigitosCnpj("60.701.190/0001-04");

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      console.log("marca com dois CNPJs");
      const marca = await tx.marca.create({ data: { nome: `__smoke_marca_${Date.now()}` } });
      const e1 = await tx.empresa.create({
        data: {
          nome: `__smoke_cnpj_a_${Date.now()}`,
          marcaId: marca.id,
          cnpj: CNPJ_A,
          razaoSocial: "Empresa A LTDA",
          cidade: "Teresina",
          uf: "PI",
        },
      });
      const e2 = await tx.empresa.create({
        data: { nome: `__smoke_cnpj_b_${Date.now()}`, marcaId: marca.id, cnpj: CNPJ_B },
      });

      const comEmpresas = await tx.marca.findUniqueOrThrow({
        where: { id: marca.id },
        include: { empresas: true },
      });
      conferir(comEmpresas.empresas.length === 2, "uma marca comporta dois CNPJs");

      console.log("empresa sem CNPJ é permitida (as antigas ainda não têm)");
      const semNumero = await tx.empresa.create({
        data: { nome: `__smoke_sem_cnpj_${Date.now()}`, marcaId: marca.id },
      });
      conferir(semNumero.cnpj === null, "vários NULL convivem no índice único");

      console.log("colaborador se prende ao CNPJ, não à marca");
      const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: e1.id } });
      const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: e1.id } });
      const colab = await tx.colaborador.create({
        data: { nome: "__smoke_pessoa", empresaId: e1.id, setorId: setor.id, posicaoId: posicao.id },
      });
      conferir(colab.empresaId === e1.id, "o vínculo aponta para a pessoa jurídica");

      const contagem = await tx.colaborador.count({ where: { empresaId: e2.id } });
      conferir(contagem === 0, "o outro CNPJ da mesma marca não herda o colaborador");

      console.log("CNPJ pode mudar de marca sem levar os colaboradores junto");
      const outraMarca = await tx.marca.create({ data: { nome: `__smoke_marca2_${Date.now()}` } });
      const movida = await tx.empresa.update({
        where: { id: e1.id },
        data: { marcaId: outraMarca.id },
      });
      conferir(movida.marcaId === outraMarca.id, "a empresa trocou de marca");
      const aindaLa = await tx.colaborador.count({ where: { empresaId: e1.id } });
      conferir(aindaLa === 1, "o colaborador seguiu com o CNPJ dele");

      console.log("validação dos dígitos");
      conferir(cnpjValido(CNPJ_A), "CNPJ real é aceito");
      conferir(!cnpjValido("33000167000102"), "dígito verificador trocado é recusado");
      conferir(formatarCnpj(CNPJ_A) === "33.000.167/0001-01", "formatação de exibição");

      // Por último de propósito: no Postgres, violar restrição ABORTA a
      // transação — todo comando seguinte é recusado, mesmo com o erro tratado.
      // Em uso normal isso não aparece (cada ação roda na sua transação), mas
      // aqui obriga a deixar esta checagem para o fim.
      console.log("CNPJ não se repete entre empresas");
      let bloqueou = false;
      try {
        await tx.empresa.create({
          data: { nome: `__smoke_dup_${Date.now()}`, marcaId: marca.id, cnpj: CNPJ_A },
        });
      } catch (e) {
        bloqueou = violouUnique(e, "Empresa_cnpj_key");
      }
      conferir(bloqueou, "o mesmo CNPJ em duas empresas é recusado pelo índice único");

      throw new RollbackProposital();
    });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }

  // Resíduo: nada do teste pode ter sobrado depois do rollback.
  const sobrou = await prisma.marca.count({ where: { nome: { startsWith: "__smoke_" } } });
  const sobrouEmpresa = await prisma.empresa.count({ where: { nome: { startsWith: "__smoke_" } } });
  conferir(sobrou === 0 && sobrouEmpresa === 0, "rollback não deixou resíduo no banco");

  console.log("\nTudo certo.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
