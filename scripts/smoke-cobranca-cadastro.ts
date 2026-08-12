// Fumaça da cobrança de cadastro do colaborador (Telegram + e-mail)
// (lib/cobranca-cadastro-colaborador.ts) contra o banco de verdade, em
// transação com rollback proposital: marca/empresa/setor/posição/colaboradores
// próprios do teste. Nada fica gravado.
//
// Bot do Telegram e SMTP não configurados neste ambiente são ESPERADOS e é o
// que torna este teste seguro de rodar: sem token e sem servidor, os dois
// canais recusam e o motor conta em `erros` sem falar com ninguém. Por isso os
// asserts de `testarSelecao` checam a SELEÇÃO (quem entra, quem fica de fora,
// quem já esgotou a rodada), nunca a entrega — `testarCaminhoFeliz`, mais
// abaixo, é que cobre o envio aceito, com o Telegram dublado.
//
// Ainda assim o `apenas` é passado em toda chamada: se um dia alguém rodar
// isto numa máquina com o token do bot ou o SMTP na env, sem o filtro a base
// inteira receberia cobrança de verdade.
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
  montarEmail,
  cobrarCadastroAgora,
  BOT_DO_RH,
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

  const email = montarEmail("Maria Souza Lima", ["Número do RG"], 1, "LM Telecom");
  ok(email.assunto.length > 0 && !email.assunto.includes("undefined"), "e-mail tem assunto");
  ok(email.texto.includes("Número do RG") && email.html.includes("Número do RG"), "e-mail lista o que falta nas duas versões");
  ok(email.texto.includes("LM Telecom") && email.html.includes("LM Telecom"), "e-mail assina a marca da pessoa, não o grupo");
  ok(email.html.includes(BOT_DO_RH), "e-mail diz o nome do bot — quem lê fora do Telegram não tem /portal à mão");
  ok(!email.texto.startsWith("<"), "versão texto do e-mail não é HTML (entrega e leitor sem HTML)");
  const email2 = montarEmail("Maria Souza Lima", ["Número do RG"], 2, "LM Telecom");
  ok(email2.assunto !== email.assunto, "assunto muda da 2ª em diante (não vira o mesmo e-mail repetido na caixa)");
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
    // Sem Telegram mas COM e-mail: desde que a cobrança passou a sair pelos
    // dois canais, esta pessoa ENTRA — antes ficava de fora por não ter chat.
    const soEmail = await criar("so_email", { rg: null, telegramChatId: null });
    // Sem nenhum canal: continua fora, porque não há por onde falar com ela.
    const semCanal = await criar("sem_canal", { rg: null, telegramChatId: null, email: null });
    const saindo = await criar("aviso_previo", { rg: null, dataDesligamento: diasAtras(-3) });
    const jaCobrado = await criar("cobrado_ontem", { rg: null });
    const esgotado = await criar("esgotado", { rg: null });

    // Quem já tem os 4 documentos no dossiê só é cobrado pelo que falta na
    // ficha — é o que separa `semRg` de `semDocumento` no teste.
    for (const tipo of ["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA"]) {
      for (const id of [semRg.id, completo.id, soEmail.id, semCanal.id, saindo.id, jaCobrado.id, esgotado.id]) {
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
          // Espalhadas no passado, a última bem fora do prazo: o que barra esta
          // pessoa tem que ser o teto de rodadas, não o intervalo.
          //
          // O passo (5) tem que ser MENOR que 90/MAX_COBRANCAS, senão as
          // últimas rodadas caem em hoje ou no futuro. Já caiu: com a fórmula
          // antiga (`60 - r * 10`, escrita quando o teto era 4), subir para 8
          // pôs três linhas no futuro e quebrou a contagem de "gravadas hoje"
          // — o teste acusou o motor por dado que o próprio teste plantou.
          enviadaEm: diasAtras(90 - r * 5),
        },
      });
    }

    const doTeste = [semRg.id, semDocumento.id, completo.id, soEmail.id, semCanal.id, saindo.id, jaCobrado.id, esgotado.id];
    const r = await executarCobrancaCadastro(tx, HOJE, doTeste);

    // Os dois filtros que cortam na própria consulta: sem NENHUM canal não há
    // como falar, e quem está de aviso prévio não se cobra. Sobram 6 dos 8.
    ok(r.avaliados === 6, `ignora quem não tem canal nenhum e quem está saindo — 6 de 8 criados (achou ${r.avaliados})`);
    ok(r.incompletos === 5, `5 fichas com algo faltando (achou ${r.incompletos})`);
    ok(r.aguardandoPrazo === 1, `1 pessoa dentro do prazo de ${DIAS_ENTRE_COBRANCAS} dias (achou ${r.aguardandoPrazo})`);
    ok(r.esgotados === 1, `1 pessoa já com ${MAX_COBRANCAS} cobranças (achou ${r.esgotados})`);

    // Sem bot nem SMTP configurados, os dois canais recusam e nada é gravado —
    // é o comportamento que protege este teste. Configurados, estes 3 sairiam
    // como `enviados`. O terceiro é justamente quem só tem e-mail: a mudança
    // de 11/08/2026 é o que o trouxe para dentro da cobrança.
    const tentados = r.enviados + r.erros;
    ok(tentados === 3, `tenta cobrar 3: ficha incompleta, documento faltando e a pessoa só com e-mail (tentou ${tentados})`);

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
    ok(
      (await tx.cobrancaCadastro.count({ where: { colaboradorId: semCanal.id } })) === 0,
      "quem não tem Telegram nem e-mail não é cobrado (fica com o RH, na pendência)",
    );

    throw new RollbackProposital();
  });
}

/**
 * O que `testarSelecao` NÃO alcança: o envio ACEITO.
 *
 * Sem token do bot, aquele bloco só prova o negativo — "não gravou porque não
 * enviou". O que acontece DEPOIS de o Telegram aceitar (grava a rodada,
 * numera a seguinte, a trava semanal segura, para em MAX_COBRANCAS) ficava
 * sem nenhuma cobertura, e é justamente a parte que roda em produção todo dia.
 *
 * Aqui o `fetch` global é trocado por um dublê antes de chamar o motor —
 * lib/telegram.ts usa o fetch global, então nenhuma requisição sai da máquina.
 * O dublê recusa qualquer URL que não seja a do Telegram: se um dia o motor
 * passar a falar com outro serviço, este teste quebra em vez de vazar chamada.
 */
async function testarCaminhoFeliz() {
  console.log("\nCaminho feliz (Telegram aceitando o envio)\n");

  const fetchReal = globalThis.fetch;
  const tokenReal = process.env.TELEGRAM_BOT_TOKEN;
  // `segredo()` lê a env antes do banco — com isto o motor se dá por
  // configurado sem depender de nada cadastrado na tela de Canais.
  process.env.TELEGRAM_BOT_TOKEN = "__smoke_token_falso";

  const enviadas: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const alvo = String(url);
    if (!alvo.includes("api.telegram.org")) throw new Error(`fetch inesperado no smoke: ${alvo}`);
    enviadas.push(JSON.parse(String(init?.body ?? "{}")).text);
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;

  try {
    await rodarComRollback(async (tx) => {
      const carimbo = Date.now();
      const marca = await tx.marca.create({ data: { nome: `__smoke_feliz_marca_${carimbo}` } });
      const empresa = await tx.empresa.create({
        data: { nome: `__smoke_feliz_empresa_${carimbo}`, marcaId: marca.id },
      });
      const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
      const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

      // Telefone preenchido e o resto em branco: tem o que cobrar, e o
      // contato não entra na lista (o par e-mail/telefone está satisfeito).
      const pessoa = await tx.colaborador.create({
        data: {
          nome: "Fulano de Tal",
          empresaId: empresa.id,
          setorId: setor.id,
          posicaoId: posicao.id,
          telegramChatId: `__smoke_feliz_${carimbo}`,
          telefone: "11999990000",
        },
      });
      const so = [pessoa.id];

      const r1 = await executarCobrancaCadastro(tx, HOJE, so);
      ok(r1.enviados === 1 && r1.erros === 0, `envia e não erra (enviados=${r1.enviados}, erros=${r1.erros})`);
      ok(enviadas.length === 1 && enviadas[0].includes("/portal"), "o que saiu é o texto da cobrança");

      const linhas1 = await tx.cobrancaCadastro.findMany({ where: { colaboradorId: pessoa.id } });
      ok(linhas1.length === 1 && linhas1[0].rodada === 1, "grava a rodada 1 depois do envio aceito");
      ok(linhas1[0]?.itens.includes("RG"), "guarda o que foi pedido, para responder a quem disser que nunca foi avisado");
      ok(linhas1[0]?.empresaId === empresa.id, "grava a empresa da pessoa");
      // SMTP não está configurado aqui, então o e-mail recusa e só o Telegram
      // entra em `canais`. É exatamente o que a coluna tem que registrar: o
      // canal que ACEITOU, nunca o que foi tentado.
      ok(
        linhas1[0]?.canais === "TELEGRAM",
        `registra só o canal que aceitou (achou "${linhas1[0]?.canais}")`,
      );
      ok(r1.porTelegram === 1 && r1.porEmail === 0, `conta por canal (telegram=${r1.porTelegram}, email=${r1.porEmail})`);

      const r2 = await executarCobrancaCadastro(tx, HOJE, so);
      ok(
        r2.enviados === 0 && r2.aguardandoPrazo === 1 && enviadas.length === 1,
        "rodar de novo no mesmo dia não reenvia (é a trava que impede cobrança diária)",
      );

      // Um dia a menos que o intervalo: continua segurando. É o teste de que a
      // trava é o intervalo configurado, não "outro dia do calendário".
      const quaseNaHora = new Date(HOJE.getTime() + (DIAS_ENTRE_COBRANCAS - 1) * 24 * 3600 * 1000);
      const rCedo = await executarCobrancaCadastro(tx, quaseNaHora, so);
      ok(
        rCedo.enviados === 0 && rCedo.aguardandoPrazo === 1,
        `${DIAS_ENTRE_COBRANCAS - 1} dia(s) depois ainda não é a hora`,
      );

      const naHora = new Date(HOJE.getTime() + DIAS_ENTRE_COBRANCAS * 24 * 3600 * 1000);
      const r3 = await executarCobrancaCadastro(tx, naHora, so);
      const linhas3 = await tx.cobrancaCadastro.findMany({
        where: { colaboradorId: pessoa.id },
        orderBy: { rodada: "asc" },
      });
      ok(
        r3.enviados === 1 && linhas3.length === 2 && linhas3[1].rodada === 2,
        `passados ${DIAS_ENTRE_COBRANCAS} dias, cobra de novo como rodada 2`,
      );
      ok(enviadas[1]?.includes("de novo"), "a 2ª mensagem reconhece que já pediu antes");

      let dia = DIAS_ENTRE_COBRANCAS;
      for (let i = 3; i <= MAX_COBRANCAS; i++) {
        dia += DIAS_ENTRE_COBRANCAS;
        await executarCobrancaCadastro(tx, new Date(HOJE.getTime() + dia * 24 * 3600 * 1000), so);
      }
      const rFim = await executarCobrancaCadastro(tx, new Date(HOJE.getTime() + (dia + 30) * 24 * 3600 * 1000), so);
      ok(
        rFim.enviados === 0 && rFim.esgotados === 1,
        `para de insistir depois de ${MAX_COBRANCAS} (enviados=${rFim.enviados}, esgotados=${rFim.esgotados})`,
      );
      ok(
        (await tx.cobrancaCadastro.count({ where: { colaboradorId: pessoa.id } })) === MAX_COBRANCAS,
        `nunca passa de ${MAX_COBRANCAS} cobranças na vida da pessoa`,
      );

      throw new RollbackProposital();
    });
  } finally {
    globalThis.fetch = fetchReal;
    if (tokenReal === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = tokenReal;
  }
}

/**
 * Cobrança avulsa, disparada pela tela — o que o cron NÃO faz.
 *
 * O que importa aqui não é o envio (já coberto acima), e sim a INDEPENDÊNCIA
 * entre as duas: o clique ignora as travas, e ao mesmo tempo não pode encurtar
 * a campanha automática de quem foi cobrado à mão nem adiar a próxima rodada
 * dele. É a parte que um erro deixaria silenciosa — a pessoa simplesmente
 * pararia de receber a cobrança automática, e ninguém notaria.
 */
async function testarCobrancaManual() {
  console.log("\nCobrança manual (botão da tela)\n");

  const fetchReal = globalThis.fetch;
  const tokenReal = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "__smoke_token_falso";

  const enviadas: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const alvo = String(url);
    if (!alvo.includes("api.telegram.org")) throw new Error(`fetch inesperado no smoke: ${alvo}`);
    enviadas.push(JSON.parse(String(init?.body ?? "{}")).text);
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;

  try {
    await rodarComRollback(async (tx) => {
      const carimbo = Date.now();
      const marca = await tx.marca.create({ data: { nome: `__smoke_manual_marca_${carimbo}` } });
      const empresa = await tx.empresa.create({
        data: { nome: `__smoke_manual_empresa_${carimbo}`, marcaId: marca.id },
      });
      const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
      const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

      const criar = (nome: string, dados: Partial<Prisma.ColaboradorUncheckedCreateInput> = {}) =>
        tx.colaborador.create({
          data: {
            nome,
            empresaId: empresa.id,
            setorId: setor.id,
            posicaoId: posicao.id,
            telegramChatId: `__smoke_manual_${carimbo}_${nome}`,
            telefone: "11999990000",
            ...dados,
          },
        });

      const pessoa = await criar("incompleto");
      const r1 = await cobrarCadastroAgora([pessoa.id], "Fulana do RH", tx, HOJE);
      ok(r1.length === 1 && r1[0].enviado, `envia na hora (${r1[0]?.motivo ?? "ok"})`);

      const linha = await tx.cobrancaCadastro.findFirstOrThrow({ where: { colaboradorId: pessoa.id } });
      ok(linha.manual === true, "grava a linha como manual");
      ok(linha.solicitadaPorNome === "Fulana do RH", `guarda quem clicou (achou "${linha.solicitadaPorNome}")`);

      // O ponto central: cobrar à mão hoje NÃO pode fazer o cron pular a pessoa.
      const auto = await executarCobrancaCadastro(tx, HOJE, [pessoa.id]);
      ok(
        auto.enviados === 1 && auto.aguardandoPrazo === 0,
        `o cron continua cobrando normalmente no mesmo dia (enviados=${auto.enviados}, aguardando=${auto.aguardandoPrazo})`,
      );

      const linhas = await tx.cobrancaCadastro.findMany({
        where: { colaboradorId: pessoa.id },
        orderBy: { rodada: "asc" },
      });
      ok(linhas.length === 2, `as duas linhas convivem (${linhas.length})`);
      ok(
        linhas[1].rodada === 2 && linhas[1].manual === false,
        "a automática numera na sequência do histórico, sem repetir a rodada 1",
      );

      // E a manual não gasta rodada do teto: com MAX manuais no histórico, o
      // cron ainda tem as suas.
      const teimoso = await criar("cobrado_a_mao_varias_vezes");
      for (let i = 0; i < MAX_COBRANCAS; i++) {
        await cobrarCadastroAgora([teimoso.id], "Fulana do RH", tx, HOJE);
      }
      const aindaAutomatica = await executarCobrancaCadastro(tx, HOJE, [teimoso.id]);
      ok(
        aindaAutomatica.enviados === 1 && aindaAutomatica.esgotados === 0,
        `${MAX_COBRANCAS} cobranças manuais não esgotam o teto automático (enviados=${aindaAutomatica.enviados}, esgotados=${aindaAutomatica.esgotados})`,
      );

      // Casos em que o botão recusa, com motivo legível na tela.
      const completo = await criar("completo", {
        rg: "1", logradouro: "R", numeroEndereco: "1", bairro: "B", uf: "SP",
        bancoNome: "X", bancoAgencia: "1", bancoConta: "1",
      });
      for (const tipo of ["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA"]) {
        await tx.documentoColaborador.create({
          data: { empresaId: empresa.id, colaboradorId: completo.id, tipo, origem: "COLABORADOR" },
        });
      }
      const rCompleto = await cobrarCadastroAgora([completo.id], "Fulana do RH", tx, HOJE);
      ok(
        !rCompleto[0].enviado && !!rCompleto[0].motivo?.includes("completo"),
        `ficha completa recusa com motivo ("${rCompleto[0]?.motivo}")`,
      );

      const semCanal = await criar("sem_canal", { telegramChatId: null, email: null });
      const rSemCanal = await cobrarCadastroAgora([semCanal.id], "Fulana do RH", tx, HOJE);
      ok(
        !rSemCanal[0].enviado && !!rSemCanal[0].motivo?.includes("por onde falar"),
        `sem canal recusa com motivo ("${rSemCanal[0]?.motivo}")`,
      );

      // Lote: devolve uma linha por pessoa, na ordem em que dá para mostrar
      // quem falhou — é disso que a tela monta o aviso.
      const rLote = await cobrarCadastroAgora([pessoa.id, completo.id, semCanal.id], "Fulana do RH", tx, HOJE);
      ok(rLote.length === 3, `lote devolve resultado por pessoa (${rLote.length})`);
      ok(
        rLote.filter((r) => r.enviado).length === 1 && rLote.filter((r) => !r.enviado).length === 2,
        "no lote, sucesso e recusa vêm separados para a tela avisar",
      );

      throw new RollbackProposital();
    });
  } finally {
    globalThis.fetch = fetchReal;
    if (tokenReal === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = tokenReal;
  }
}

async function main() {
  console.log("Cobrança de cadastro do colaborador (Telegram + e-mail)\n");
  testarRegras();
  await testarSelecao();
  await testarCaminhoFeliz();
  await testarCobrancaManual();

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
