// Fumaça da cobrança de cadastro do colaborador
// (lib/cobranca-cadastro-colaborador.ts) contra o banco de verdade, em
// transação com rollback proposital: marca/empresa/setor/posição/colaboradores
// próprios do teste. Nada fica gravado.
//
// Bot do Telegram não configurado neste ambiente é ESPERADO e é o que torna
// este teste seguro de rodar: sem token, sendTelegramMessage devolve erro e o
// motor conta em `erros` sem falar com ninguém. Por isso os asserts checam a
// SELEÇÃO (quem entra, quem fica de fora, quem já esgotou a rodada) e o texto
// da mensagem, nunca a entrega.
//
// Ainda assim o `apenas` é passado em toda chamada: se um dia alguém rodar
// isto numa máquina com o token do bot na env, sem o filtro a base inteira
// receberia cobrança de verdade.
//
//   npx tsx scripts/smoke-cobranca-cadastro.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  executarCobrancaCadastro,
  faltasNaFicha,
  documentosFaltando,
  montarMensagem,
  DIAS_ENTRE_COBRANCAS,
  MAX_COBRANCAS,
} from "../lib/cobranca-cadastro-colaborador";

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

const HOJE = new Date();
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 24 * 3600 * 1000);

/** Ficha sem nenhuma falta — a base de comparação dos casos abaixo. */
const FICHA_COMPLETA = {
  email: "completo@example.com",
  telefone: "11999990000",
  rg: "123456789",
  logradouro: "Rua A",
  numeroEndereco: "10",
  bairro: "Centro",
  uf: "SP",
  bancoNome: "Banco X",
  bancoAgencia: "0001",
  bancoConta: "12345-6",
};

function testarRegras() {
  console.log("Regras puras (o que conta como falta)\n");

  ok(faltasNaFicha(FICHA_COMPLETA).length === 0, "ficha completa não gera nenhuma falta");

  ok(
    faltasNaFicha({ ...FICHA_COMPLETA, email: null }).length === 0,
    "só e-mail vazio não é falta de contato — telefone sozinho basta",
  );
  ok(
    faltasNaFicha({ ...FICHA_COMPLETA, email: null, telefone: null }).length === 1,
    "sem e-mail E sem telefone vira uma falta de contato",
  );

  ok(
    faltasNaFicha({ ...FICHA_COMPLETA, logradouro: null, bairro: null, uf: null }).length === 1,
    "endereço pela metade vira UMA linha, não uma por campo",
  );
  ok(
    faltasNaFicha({ ...FICHA_COMPLETA, bancoAgencia: null, bancoConta: null }).length === 1,
    "dados bancários pela metade viram UMA linha",
  );

  // O recorte que dá razão de existir a este motor: só se cobra o que a pessoa
  // resolve sozinha no portal. CPF e data de admissão marcam a ficha como
  // incompleta em lib/pendencias.ts, mas não são editáveis pelo colaborador.
  ok(
    faltasNaFicha(FICHA_COMPLETA).length === 0,
    "CPF e data de admissão não entram na cobrança do colaborador (são do RH)",
  );

  const todosDocs = documentosFaltando(["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA"]);
  ok(todosDocs.length === 0, "dossiê com os 4 documentos não cobra nenhum");
  ok(
    documentosFaltando(["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA", "CONTRATO"]).length === 0,
    "CONTRATO não é cobrado do colaborador (papel que a empresa emite)",
  );
  ok(documentosFaltando([]).length === 4, "dossiê vazio cobra os 4 documentos");
  ok(
    documentosFaltando(["RG"]).length === 3 && !documentosFaltando(["RG"]).some((d) => d.includes("RG")),
    "documento já enviado sai da lista (mesmo aguardando conferência do RH)",
  );

  const primeira = montarMensagem("Maria Souza Lima", ["Número do RG"], 1);
  ok(primeira.includes("Oi, Maria!"), "mensagem trata pelo primeiro nome");
  ok(primeira.includes("/portal"), "mensagem diz como resolver (/portal)");
  ok(primeira.includes("• Número do RG"), "mensagem lista o que falta");
  const segunda = montarMensagem("Maria Souza Lima", ["Número do RG"], 2);
  ok(segunda !== primeira && segunda.includes("de novo"), "da 2ª em diante o texto reconhece que já pediu");
}

async function testarSelecao() {
  console.log("\nSeleção contra o banco\n");

  await rodarComRollback(async (tx) => {
    const carimbo = Date.now();
    const marca = await tx.marca.create({ data: { nome: `__smoke_cobranca_marca_${carimbo}` } });
    const empresa = await tx.empresa.create({
      data: { nome: `__smoke_cobranca_empresa_${carimbo}`, marcaId: marca.id },
    });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

    const criar = (nome: string, dados: Partial<Prisma.ColaboradorUncheckedCreateInput>) =>
      tx.colaborador.create({
        data: {
          nome,
          empresaId: empresa.id,
          setorId: setor.id,
          posicaoId: posicao.id,
          telegramChatId: `__smoke_${carimbo}_${nome}`,
          ...FICHA_COMPLETA,
          ...dados,
        },
      });

    // Cada pessoa isola UM motivo de entrar (ou não) na cobrança.
    const semRg = await criar("incompleto", { rg: null });
    const semDocumento = await criar("sem_documento", {});
    const completo = await criar("completo", {});
    const semTelegram = await criar("sem_telegram", { rg: null, telegramChatId: null });
    const saindo = await criar("aviso_previo", { rg: null, dataDesligamento: diasAtras(-3) });
    const jaCobrado = await criar("cobrado_ontem", { rg: null });
    const esgotado = await criar("esgotado", { rg: null });

    // Quem já tem os 4 documentos no dossiê só é cobrado pelo que falta na
    // ficha — é o que separa `semRg` de `semDocumento` no teste.
    for (const tipo of ["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA"]) {
      for (const id of [semRg.id, completo.id, semTelegram.id, saindo.id, jaCobrado.id, esgotado.id]) {
        await tx.documentoColaborador.create({
          data: { empresaId: empresa.id, colaboradorId: id, tipo, origem: "COLABORADOR" },
        });
      }
    }

    await tx.cobrancaCadastro.create({
      data: { colaboradorId: jaCobrado.id, empresaId: empresa.id, rodada: 1, itens: "Número do RG", enviadaEm: diasAtras(1) },
    });
    for (let r = 1; r <= MAX_COBRANCAS; r++) {
      await tx.cobrancaCadastro.create({
        data: {
          colaboradorId: esgotado.id,
          empresaId: empresa.id,
          rodada: r,
          itens: "Número do RG",
          // Espalhadas no passado, a última bem fora do prazo semanal: o que
          // barra esta pessoa tem que ser o teto de rodadas, não o intervalo.
          enviadaEm: diasAtras(60 - r * 10),
        },
      });
    }

    const doTeste = [semRg.id, semDocumento.id, completo.id, semTelegram.id, saindo.id, jaCobrado.id, esgotado.id];
    const r = await executarCobrancaCadastro(tx, HOJE, doTeste);

    // Os dois filtros que cortam na própria consulta: sem Telegram não há
    // canal, e quem está de aviso prévio não se cobra. Sobram 5 dos 7.
    ok(r.avaliados === 5, `ignora quem não tem Telegram e quem está saindo — 5 de 7 criados (achou ${r.avaliados})`);
    ok(r.incompletos === 4, `4 fichas com algo faltando (achou ${r.incompletos})`);
    ok(r.aguardandoPrazo === 1, `1 pessoa dentro do prazo de ${DIAS_ENTRE_COBRANCAS} dias (achou ${r.aguardandoPrazo})`);
    ok(r.esgotados === 1, `1 pessoa já com ${MAX_COBRANCAS} cobranças (achou ${r.esgotados})`);

    // Sem bot configurado o envio falha e nada é gravado — é o comportamento
    // que protege este teste. Com bot, os mesmos 2 sairiam como `enviados`.
    const tentados = r.enviados + r.erros;
    ok(tentados === 2, `tenta cobrar exatamente 2 pessoas: ficha incompleta e documento faltando (tentou ${tentados})`);

    const gravadas = await tx.cobrancaCadastro.count({
      where: { colaboradorId: { in: doTeste }, enviadaEm: { gte: diasAtras(0.5) } },
    });
    ok(
      gravadas === r.enviados,
      `só grava rodada de quem recebeu de verdade (${gravadas} gravada(s) para ${r.enviados} enviada(s))`,
    );

    ok(
      (await tx.cobrancaCadastro.count({ where: { colaboradorId: saindo.id } })) === 0,
      "quem está de aviso prévio não é cobrado",
    );
    ok(
      (await tx.cobrancaCadastro.count({ where: { colaboradorId: completo.id } })) === 0,
      "ficha completa não é cobrada",
    );

    throw new RollbackProposital();
  });
}

async function main() {
  console.log("Cobrança de cadastro do colaborador (Telegram)\n");
  testarRegras();
  await testarSelecao();

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
