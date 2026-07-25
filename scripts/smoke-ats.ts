// Fumaça do ATS contra o banco de verdade. Em transação com rollback
// proposital: vaga com slug único, inscrição, movimentação de etapa gerando
// evento (foto/filme), a constraint que impede inscrição dupla na mesma vaga,
// reaproveitamento do candidato do banco de talentos em outra vaga, e a
// exclusão da candidatura preservando o candidato. Nada fica gravado.
//
//   npx tsx scripts/smoke-ats.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gerarSlugVaga } from "../lib/constants-ats";
import { violouUnique } from "../lib/prisma-erros";

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

async function rodarComRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(fn, { timeout: 30_000 });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }
}

const CPF_TESTE = "52998224725";

async function main() {
  const empresa = await prisma.empresa.findFirst({ where: { ativo: true } });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");

  console.log(`Empresa: ${empresa.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  console.log("1. Slug é único e imprevisível");
  {
    const a = gerarSlugVaga("Técnico de Instalação");
    const b = gerarSlugVaga("Técnico de Instalação");
    ok(a !== b, "dois slugs do mesmo título não colidem (sufixo aleatório)");
    ok(a.startsWith("tecnico-de-instalacao-"), `acento removido corretamente (${a})`);
  }

  console.log("2. Vaga, inscrição e movimentação de etapa com histórico");
  await rodarComRollback(async (tx) => {
    const vaga = await tx.vaga.create({
      data: { empresaId: empresa.id, titulo: "SMOKE — Técnico de campo", slug: gerarSlugVaga("SMOKE tecnico"), quantidade: 2 },
    });
    ok(vaga.status === "ABERTA" && !vaga.publicada, "vaga nasce ABERTA e NÃO publicada");

    const candidato = await tx.candidato.create({
      data: { empresaId: empresa.id, nome: "Candidato Smoke", cpf: CPF_TESTE, origem: "PUBLICO", consentimentoEm: new Date() },
    });
    const candidatura = await tx.candidatura.create({
      data: { empresaId: empresa.id, vagaId: vaga.id, candidatoId: candidato.id },
    });
    ok(candidatura.etapa === "TRIAGEM", "candidatura nasce em TRIAGEM");

    await tx.eventoCandidatura.create({ data: { candidaturaId: candidatura.id, etapaNova: "TRIAGEM" } });
    await tx.candidatura.update({ where: { id: candidatura.id }, data: { etapa: "ENTREVISTA" } });
    await tx.eventoCandidatura.create({
      data: { candidaturaId: candidatura.id, etapaAnterior: "TRIAGEM", etapaNova: "ENTREVISTA" },
    });

    const atual = await tx.candidatura.findUnique({
      where: { id: candidatura.id },
      include: { eventos: { orderBy: { createdAt: "asc" } } },
    });
    ok(atual?.etapa === "ENTREVISTA", "a foto (Candidatura.etapa) reflete a etapa atual");
    ok(atual?.eventos.length === 2, "o filme (EventoCandidatura) guardou as duas transições");
    ok(atual?.eventos[1].etapaAnterior === "TRIAGEM", "o evento registra de onde veio");

    throw new RollbackProposital();
  });

  console.log("3. Mesma pessoa não se inscreve duas vezes na mesma vaga");
  await rodarComRollback(async (tx) => {
    const vaga = await tx.vaga.create({
      data: { empresaId: empresa.id, titulo: "SMOKE — dupla", slug: gerarSlugVaga("SMOKE dupla") },
    });
    const candidato = await tx.candidato.create({
      data: { empresaId: empresa.id, nome: "Candidato Smoke", cpf: CPF_TESTE },
    });
    await tx.candidatura.create({ data: { empresaId: empresa.id, vagaId: vaga.id, candidatoId: candidato.id } });
    try {
      await tx.candidatura.create({ data: { empresaId: empresa.id, vagaId: vaga.id, candidatoId: candidato.id } });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
        "constraint UNIQUE(vagaId, candidatoId) barra a inscrição repetida",
      );
      // Regressão: o nome do índice NÃO aparece em e.message (só os campos),
      // então `e.message.includes(indice)` nunca casa e o erro vaza como 500
      // na página pública. violouUnique procura no lugar certo (e.meta).
      ok(violouUnique(e, "Candidatura_vagaId_candidatoId_key"), "violouUnique reconhece o índice pelo nome");
      ok(
        !(e instanceof Error && e.message.includes("Candidatura_vagaId_candidatoId_key")),
        "confirmado: o nome do índice realmente não está em e.message",
      );
      ok(!violouUnique(e, "Outro_indice_qualquer_key"), "violouUnique não dá falso positivo para outro índice");
    }
    throw new RollbackProposital();
  });

  console.log("4. CPF é único por empresa — é o que sustenta o banco de talentos");
  await rodarComRollback(async (tx) => {
    await tx.candidato.create({ data: { empresaId: empresa.id, nome: "Primeiro", cpf: CPF_TESTE } });
    try {
      await tx.candidato.create({ data: { empresaId: empresa.id, nome: "Duplicado", cpf: CPF_TESTE } });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
        "constraint UNIQUE(empresaId, cpf) impede candidato duplicado",
      );
    }
    throw new RollbackProposital();
  });

  console.log("5. Candidato sem CPF pode repetir (NULL não colide no Postgres)");
  await rodarComRollback(async (tx) => {
    await tx.candidato.create({ data: { empresaId: empresa.id, nome: "Sem CPF A" } });
    await tx.candidato.create({ data: { empresaId: empresa.id, nome: "Sem CPF B" } });
    const total = await tx.candidato.count({ where: { empresaId: empresa.id, cpf: null, nome: { startsWith: "Sem CPF" } } });
    ok(total === 2, "dois candidatos sem CPF convivem — o RH cadastra sem exigir documento");
    throw new RollbackProposital();
  });

  console.log("6. Mesmo candidato em duas vagas, e excluir candidatura preserva o candidato");
  await rodarComRollback(async (tx) => {
    const vagaA = await tx.vaga.create({
      data: { empresaId: empresa.id, titulo: "SMOKE — vaga A", slug: gerarSlugVaga("SMOKE A") },
    });
    const vagaB = await tx.vaga.create({
      data: { empresaId: empresa.id, titulo: "SMOKE — vaga B", slug: gerarSlugVaga("SMOKE B") },
    });
    const candidato = await tx.candidato.create({
      data: { empresaId: empresa.id, nome: "Reaproveitado", cpf: CPF_TESTE },
    });

    const candA = await tx.candidatura.create({
      data: { empresaId: empresa.id, vagaId: vagaA.id, candidatoId: candidato.id, etapa: "REPROVADO" },
    });
    await tx.candidatura.create({ data: { empresaId: empresa.id, vagaId: vagaB.id, candidatoId: candidato.id } });
    const total = await tx.candidatura.count({ where: { candidatoId: candidato.id } });
    ok(total === 2, "reprovado numa vaga volta a concorrer noutra sem recadastrar");

    await tx.candidatura.delete({ where: { id: candA.id } });
    const candidatoSobrou = await tx.candidato.count({ where: { id: candidato.id } });
    ok(candidatoSobrou === 1, "excluir a candidatura NÃO apaga o candidato do banco de talentos");

    throw new RollbackProposital();
  });

  console.log("7. Excluir a vaga leva junto candidaturas e eventos (cascata)");
  await rodarComRollback(async (tx) => {
    const vaga = await tx.vaga.create({
      data: { empresaId: empresa.id, titulo: "SMOKE — cascata", slug: gerarSlugVaga("SMOKE cascata") },
    });
    const candidato = await tx.candidato.create({ data: { empresaId: empresa.id, nome: "Cascata", cpf: CPF_TESTE } });
    const candidatura = await tx.candidatura.create({
      data: { empresaId: empresa.id, vagaId: vaga.id, candidatoId: candidato.id },
    });
    await tx.eventoCandidatura.create({ data: { candidaturaId: candidatura.id, etapaNova: "TRIAGEM" } });

    await tx.vaga.delete({ where: { id: vaga.id } });
    const candidaturas = await tx.candidatura.count({ where: { vagaId: vaga.id } });
    const eventos = await tx.eventoCandidatura.count({ where: { candidaturaId: candidatura.id } });
    const candidatoSobrou = await tx.candidato.count({ where: { id: candidato.id } });
    ok(candidaturas === 0 && eventos === 0, "candidaturas e eventos somem com a vaga");
    ok(candidatoSobrou === 1, "o candidato continua no banco de talentos mesmo sem a vaga");

    throw new RollbackProposital();
  });

  const sobrouVaga = await prisma.vaga.count({ where: { empresaId: empresa.id, titulo: { startsWith: "SMOKE" } } });
  const sobrouCandidato = await prisma.candidato.count({ where: { empresaId: empresa.id, cpf: CPF_TESTE } });
  ok(sobrouVaga === 0, "nenhuma vaga de teste sobrou no banco");
  ok(sobrouCandidato === 0, "nenhum candidato de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
