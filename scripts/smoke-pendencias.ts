// Fumaça da tela de pendências contra o banco de verdade, em transação com
// rollback proposital. Nada fica gravado.
//
//   npx tsx scripts/smoke-pendencias.ts
//
// Por que este teste existe: `lib/pendencias.ts` alimenta a primeira tela que
// todo mundo vê ao abrir o sistema — e até 04/08/2026 não tinha teste nenhum,
// com 17 contadores dentro. Já custou caro duas vezes: uma versão referenciou
// campos inexistentes e derrubou o deploy, e outra inverteu a semântica de
// "desligamentos incompletos" sem ninguém perceber. Cada contador aqui é
// medido por DELTA (antes/depois de criar o dado), nunca por valor absoluto:
// a base cresce, e asserção de número fixo quebra sozinha com o tempo — foi
// exatamente assim que o smoke:alertas-rh apodreceu.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  pendenciasDaEmpresa,
  modulosSemRegistro,
  empresasComRegistro,
  semRegistroNoEscopo,
  totalPendencias,
  zeradas,
} from "../lib/pendencias";
import type { Pendencias } from "../lib/pendencias";
import { hojeUTC, somarDiasUTC } from "../lib/datas";
import { LIMITE_HORAS_EXTRAS_MES } from "../lib/constants-folha";
import { empresaDeTeste } from "./_empresa-de-teste";

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

/** Quanto o contador `chave` subiu entre duas medições. */
const delta = (antes: Pendencias, depois: Pendencias, chave: keyof Pendencias) =>
  depois[chave] - antes[chave];

async function main() {
  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa.id, ativo: true },
    select: { id: true, nome: true, tipoContrato: true, dataFimContrato: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador ativo.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  const hoje = hojeUTC();
  const escopo = [empresa.id];

  // Uma segunda empresa qualquer, só para provar que o escopo não vaza entre
  // CNPJs. Se só existir uma cadastrada, a asserção que depende dela é PULADA —
  // comparar a empresa com ela mesma acusaria falha onde não há.
  const vizinha = await prisma.empresa.findFirst({
    where: { id: { not: empresa.id }, ativo: true },
    select: { id: true },
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. O contrato do formato certo é contado; o do formato errado, não");
        const antes = await pendenciasDaEmpresa(escopo, tx);

        // CLT não tem prazo: mesmo com data preenchida, não é pendência.
        await tx.colaborador.update({
          where: { id: colaborador.id },
          data: { tipoContrato: "CLT", dataFimContrato: somarDiasUTC(hoje, 5) },
        });
        ok(
          delta(antes, await pendenciasDaEmpresa(escopo, tx), "contratosVencendo") === 0,
          "CLT com data de fim NÃO conta (só EXPERIENCIA, TEMPORARIO e ESTAGIO têm prazo)",
        );

        await tx.colaborador.update({
          where: { id: colaborador.id },
          data: { tipoContrato: "EXPERIENCIA" },
        });
        ok(
          delta(antes, await pendenciasDaEmpresa(escopo, tx), "contratosVencendo") === 1,
          "experiência terminando em 5 dias conta",
        );

        // O caso que motivou a coluna: prazo JÁ vencido tem que continuar
        // cobrando. Se sumisse ao passar da data, o contrato viraria
        // indeterminado em silêncio — exatamente o que se quer evitar.
        await tx.colaborador.update({
          where: { id: colaborador.id },
          data: { dataFimContrato: somarDiasUTC(hoje, -30) },
        });
        ok(
          delta(antes, await pendenciasDaEmpresa(escopo, tx), "contratosVencendo") === 1,
          "experiência vencida há 30 dias CONTINUA contando (não some da tela)",
        );

        await tx.colaborador.update({
          where: { id: colaborador.id },
          data: { tipoContrato: colaborador.tipoContrato, dataFimContrato: colaborador.dataFimContrato },
        });

        console.log("2. Hora extra soma por pessoa e só conta acima do teto legal");
        const antesHE = await pendenciasDaEmpresa(escopo, tx);
        const competencia = await tx.competenciaFolha.create({
          data: { empresaId: empresa.id, referencia: new Date(Date.UTC(2099, 0, 1)), status: "ABERTA" },
        });
        const lancar = (tipo: string, quantidade: number) =>
          tx.eventoFolha.create({
            data: {
              empresaId: empresa.id,
              competenciaId: competencia.id,
              colaboradorId: colaborador.id,
              tipo,
              quantidade,
            },
          });

        // Duas rubricas somam para a MESMA pessoa: 30 + 20 = 50 > 44.
        await lancar("HORA_EXTRA_50", 30);
        ok(
          delta(antesHE, await pendenciasDaEmpresa(escopo, tx), "horasExtrasExcedidas") === 0,
          `30h sozinhas não passam do teto de ${LIMITE_HORAS_EXTRAS_MES}h`,
        );
        await lancar("HORA_EXTRA_100", 20);
        ok(
          delta(antesHE, await pendenciasDaEmpresa(escopo, tx), "horasExtrasExcedidas") === 1,
          "50h somando as duas rubricas passa, e conta UMA vez (a pessoa, não o lançamento)",
        );

        // Adicional noturno é hora, mas não é jornada extraordinária.
        await lancar("ADICIONAL_NOTURNO", 100);
        ok(
          delta(antesHE, await pendenciasDaEmpresa(escopo, tx), "horasExtrasExcedidas") === 1,
          "adicional noturno não infla o teto de hora extra",
        );

        // Competência FECHADA sai da conta: o mês já foi para o contador.
        await tx.competenciaFolha.update({
          where: { id: competencia.id },
          data: { status: "FECHADA" },
        });
        ok(
          delta(antesHE, await pendenciasDaEmpresa(escopo, tx), "horasExtrasExcedidas") === 0,
          "competência fechada não cobra mais",
        );

        console.log("3. Atestado abonado sem documento — e sem contar duas vezes");
        const antesAt = await pendenciasDaEmpresa(escopo, tx);
        const ausencia = await tx.ausencia.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "ATESTADO",
            dataInicio: hoje,
            dataFim: hoje,
            dias: 1,
            abonada: true,
            status: "PENDENTE",
          },
        });
        const comPendente = await pendenciasDaEmpresa(escopo, tx);
        ok(
          delta(antesAt, comPendente, "aprovacoes") === 1 &&
            delta(antesAt, comPendente, "atestadosSemDocumento") === 0,
          "atestado PENDENTE entra só em aprovações — não é contado duas vezes",
        );

        await tx.ausencia.update({ where: { id: ausencia.id }, data: { status: "APROVADA" } });
        const comAprovado = await pendenciasDaEmpresa(escopo, tx);
        ok(
          delta(antesAt, comAprovado, "aprovacoes") === 0 &&
            delta(antesAt, comAprovado, "atestadosSemDocumento") === 1,
          "aprovado sem anexo troca de contador: sai de aprovações, entra em atestado sem documento",
        );

        console.log("4. Dependente sem CPF conta a PESSOA, não o dependente");
        const antesDep = await pendenciasDaEmpresa(escopo, tx);
        const base = {
          colaboradorId: colaborador.id,
          parentesco: "FILHO",
          irrf: true,
          cpf: null,
        };
        await tx.dependente.create({ data: { ...base, nome: "Dependente de teste 1" } });
        await tx.dependente.create({ data: { ...base, nome: "Dependente de teste 2" } });
        ok(
          delta(antesDep, await pendenciasDaEmpresa(escopo, tx), "dependentesSemCpf") === 1,
          "dois dependentes sem CPF do mesmo colaborador contam 1 (é quem o RH vai chamar)",
        );

        console.log("5. Módulos sem nenhum registro deixam de ser contados como 'em dia'");
        // A ausência e o evento de folha criados acima tiraram esses dois
        // módulos do vazio; SST continua intocada nesta transação.
        const vazios = await modulosSemRegistro(escopo, tx);
        ok(!vazios.has("atestadosSemDocumento"), "ausência criada: módulo deixou de estar vazio");
        ok(!vazios.has("horasExtrasExcedidas"), "evento de folha criado: módulo deixou de estar vazio");
        ok(!vazios.has("dependentesSemCpf"), "dependente criado: módulo deixou de estar vazio");
        ok(
          (await modulosSemRegistro([], tx)).size === 0,
          "sem empresa nenhuma no escopo, não afirma vazio sobre nada",
        );

        // O que a tela do grupo usa: uma consulta só, lida por marca. Um
        // módulo usado NESTA empresa não pode contar como usado numa empresa
        // que não o abriu — se o escopo vazasse, a etiqueta da marca vizinha
        // viraria "em dia" de graça.
        if (vizinha) {
          const comRegistro = await empresasComRegistro([empresa.id, vizinha.id], tx);
          ok(
            comRegistro.get("atestadosSemDocumento")?.has(empresa.id) === true,
            "empresasComRegistro aponta a empresa que tem a ausência",
          );
          ok(
            semRegistroNoEscopo(comRegistro, [vizinha.id]).has("atestadosSemDocumento"),
            "e a vizinha continua sem base — o escopo não vaza entre CNPJs",
          );
        } else {
          console.log("  – só há uma empresa cadastrada, pulando a prova de escopo");
        }

        console.log("6. O total soma TODOS os contadores");
        // Regressão dirigida: a soma escrita à mão já esqueceu campos e
        // mostrou número menor do que a realidade. `zeradas()` é a fonte da
        // lista de chaves — se alguém acrescentar um contador e esquecer aqui,
        // este teste não deixa passar.
        const p = await pendenciasDaEmpresa(escopo, tx);
        const somaManual = (Object.keys(zeradas()) as (keyof Pendencias)[]).reduce(
          (s, k) => s + p[k],
          0,
        );
        ok(
          totalPendencias(p) === somaManual,
          // Contagem dinâmica: o texto dizia "17 chaves" fixo e já estava
          // errado antes de 19/08/2026 (eram 19). Quem lê a saída do smoke
          // precisa do número de agora, não do número de quando foi escrito.
          `total (${totalPendencias(p)}) = soma das ${Object.keys(zeradas()).length} chaves`,
        );
        ok(
          Object.keys(p).length === Object.keys(zeradas()).length,
          "o objeto devolvido tem exatamente as chaves declaradas em zeradas()",
        );

        throw new RollbackProposital();
      },
      { timeout: 60000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n(rollback executado — nada foi gravado)");
  }

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
