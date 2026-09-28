// Fumaça da Caixa de documentos contra o banco de verdade, SEM IA: o extrator
// é injetado (a "leitura" vem pronta no campo Assunto do PDF de teste). Cria
// uma marca, duas empresas e quatro pessoas só para o teste, processa uma
// "folha" de 5 páginas e confere cada destino, as travas e a idempotência.
// Apaga tudo o que criou no fim, passe ou falhe.
//
//   npx tsx scripts/smoke-caixa-documentos.ts
import "dotenv/config";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../lib/prisma";
import { apagarOriginal, avancarRecebido, progressoDe } from "../lib/caixa-documentos/processar";
import { marcaDoId } from "../lib/caixa-documentos/sigilo";
import { MOTIVO_FORA_DO_ESCOPO } from "../lib/caixa-documentos/tipos";
import type { InventarioPaginas } from "../lib/caixa-documentos/extracao";
import { registrarConteudo } from "../lib/caixa-documentos/registrar";
import type { Extrator } from "../lib/caixa-documentos/ia";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const SUFIXO = Date.now().toString(36);
const CNPJ_A = "11222333000181";
const CNPJ_B = "11444777000161";
const CPF_ANA = "52998224725";
const CPF_BRUNO = "11144477735";
const CPF_CARLA = "39053344705";
const PIS_ANA = "12056412545";
const CPF_DE_FORA = "15350946056"; // ninguém do escopo do teste

/** O PDF de teste: N páginas em branco e a "leitura" no Assunto. */
async function pdfDeTeste(paginas: number, leitura: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([300, 300]).drawText(`pagina ${i + 1}`, { x: 20, y: 150 });
  doc.setSubject(JSON.stringify(leitura));
  return new Uint8Array(await doc.save());
}

/** Extrator de teste: devolve do Assunto o que cai no bloco pedido. */
const extrator: Extrator = async ({ original, bloco }) => {
  const doc = await PDFDocument.load(original!, { updateMetadata: false });
  const todas = JSON.parse(doc.getSubject() ?? "{}") as { paginas: { pagina: number }[]; documentos: { paginaInicio: number }[] };
  const dentro = (p: number) => p >= bloco.inicio && p <= bloco.fim;
  return {
    ok: true,
    bruto: {
      resumo: "teste",
      paginas: todas.paginas.filter((p) => dentro(p.pagina)),
      documentos: todas.documentos.filter((d) => dentro(d.paginaInicio)),
    },
    tokensEntrada: 10,
    tokensSaida: 5,
    modelo: "teste",
  };
};

const vazio = {
  dataDocumento: "", competencia: "", tipoFolha: "NAO_LIDO", anoCalendario: 0, validoAte: "", asoTipo: "NAO_LIDO",
  asoResultado: "NAO_LIDO", restricoes: "", medico: "", crm: "", clinica: "", dataInicio: "", dataFim: "", dias: 0,
  norma: "", cargaHoraria: 0, descricao: "",
};
const doc = (p: Record<string, unknown>) => ({
  continuaAntes: false, continuaDepois: false, pis: "", confianca: 0.95, ...p, campos: { ...vazio, ...(p.campos as object) },
});

async function main() {
  const marca = await prisma.marca.create({ data: { nome: `Smoke Caixa ${SUFIXO}` } });
  const empA = await prisma.empresa.create({ data: { nome: `Caixa A ${SUFIXO}`, cnpj: CNPJ_A + "", marcaId: marca.id, ativo: true } }).catch(async () =>
    prisma.empresa.create({ data: { nome: `Caixa A ${SUFIXO}`, marcaId: marca.id, ativo: true } }),
  );
  const empB = await prisma.empresa.create({ data: { nome: `Caixa B ${SUFIXO}`, marcaId: marca.id, ativo: true } });
  // Empresa com CNPJ cadastrado, mas FORA do escopo dos arquivos do teste.
  const empC = await prisma.empresa
    .create({ data: { nome: `Caixa C ${SUFIXO}`, cnpj: CNPJ_B, marcaId: marca.id, ativo: true } })
    .catch(async () => prisma.empresa.create({ data: { nome: `Caixa C ${SUFIXO}`, marcaId: marca.id, ativo: true } }));
  const cnpjC = (await prisma.empresa.findUnique({ where: { id: empC.id }, select: { cnpj: true } }))!.cnpj;
  // CNPJ único no banco: se o de teste já existir (outro smoke), usa o que der.
  const cnpjA = (await prisma.empresa.findUnique({ where: { id: empA.id }, select: { cnpj: true } }))!.cnpj;
  if (!cnpjA) {
    console.log("  (CNPJ de teste já em uso no banco — pulando a parte que depende dele)");
  }

  const criar = async (empresaId: string, nome: string, cpf: string | null, extra: Record<string, unknown> = {}) => {
    const setor = await prisma.setor.upsert({
      where: { empresaId_nome: { empresaId, nome: "Smoke" } },
      update: {},
      create: { empresaId, nome: "Smoke", ativo: true },
    });
    const posicao = await prisma.posicao.upsert({
      where: { empresaId_nome: { empresaId, nome: "Smoke" } },
      update: {},
      create: { empresaId, nome: "Smoke" },
    });
    return prisma.colaborador.create({
      data: { empresaId, nome, cpf, setorId: setor.id, posicaoId: posicao.id, dataAdmissao: new Date(Date.UTC(2024, 0, 10)), ativo: true, ...extra },
    });
  };
  const ana = await criar(empA.id, "Ana Souza Smoke", CPF_ANA);
  await criar(empA.id, "Bruno Lima Smoke", CPF_BRUNO);
  await criar(empA.id, "Carla Dias Smoke", CPF_CARLA);
  await criar(empB.id, "Carla Dias Smoke", CPF_CARLA); // mesma pessoa em outro CNPJ

  const usuario = { id: "smoke", nome: "Smoke" };
  try {
    console.log("1. Uma folha de 5 páginas com quatro documentos:");
    const leitura = {
      paginas: [
        { pagina: 1, pessoas: 1, identificadores: [CPF_ANA] },
        { pagina: 2, pessoas: 1, identificadores: [CPF_BRUNO] },
        { pagina: 3, pessoas: 2, identificadores: [CPF_CARLA, CPF_ANA] },
        { pagina: 4, pessoas: 1, identificadores: [CPF_ANA] },
        { pagina: 5, pessoas: 0, identificadores: [] },
      ],
      documentos: [
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 1, paginaFim: 1, nome: "ANA SOUZA SMOKE", cpf: CPF_ANA, cnpjEmpregador: CNPJ_A, campos: { competencia: "2026-08", tipoFolha: "MENSAL" } }),
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 2, paginaFim: 2, nome: "BRUNO LIMA SMOKE", cpf: CPF_BRUNO, cnpjEmpregador: "", campos: { competencia: "2026-08", tipoFolha: "MENSAL" } }),
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 3, paginaFim: 3, nome: "CARLA DIAS SMOKE", cpf: CPF_CARLA, cnpjEmpregador: CNPJ_A, campos: { competencia: "2026-08", tipoFolha: "MENSAL" } }),
        doc({ tipo: "ASO", paginaInicio: 4, paginaFim: 4, nome: "Ana Souza Smoke", cpf: CPF_ANA, cnpjEmpregador: CNPJ_A, campos: { asoTipo: "PERIODICO", asoResultado: "APTO", dataDocumento: "2026-09-10" } }),
        doc({ tipo: "NAO_E_DE_COLABORADOR", paginaInicio: 5, paginaFim: 5, nome: "", cpf: "", cnpjEmpregador: "" }),
      ],
    };
    const bytes = await pdfDeTeste(5, leitura);

    const novo = async () =>
      prisma.documentoRecebido.create({
        data: {
          empresaId: empA.id,
          empresasEscopo: [empA.id, empB.id],
          nome: "folha-smoke.pdf",
          mimeType: "application/pdf",
          tamanhoBytes: bytes.byteLength,
          hash: "",
          status: "AGUARDANDO_UPLOAD",
          criadoPorId: "smoke",
          criadoPorNome: "Smoke",
        },
      });
    const r1 = await novo();
    const reg = await registrarConteudo({ recebidoId: r1.id, empresaId: empA.id, bytes, mimeType: "application/pdf", blobUrl: null, usuario });
    ok(reg.ok && reg.paginas === 5, "registrado com 5 páginas (contadas no servidor)");

    for (let i = 0; i < 20; i++) {
      const p = await avancarRecebido(r1.id, usuario, extrator);
      if (!p || !["PENDENTE", "LENDO", "ROTEANDO"].includes(p.status)) break;
    }
    const fim = await progressoDe(r1.id);
    ok(fim?.status === "CONCLUIDO", `arquivo concluído (${fim?.status})`);

    const itens = await prisma.itemDocumentoRecebido.findMany({ where: { recebidoId: r1.id }, orderBy: { paginaInicio: "asc" } });
    const pag = (n: number) => itens.find((i) => i.paginaInicio === n)!;
    if (cnpjA) {
      ok(pag(1).status === "GRAVADO" && pag(1).colaboradorId === ana.id, "contracheque da Ana (CPF + CNPJ + página só dela) → gravado sozinho");
    }
    ok(pag(2).status === "CONFERIR" && (pag(2).motivo ?? "").includes("CNPJ"), "contracheque do Bruno sem CNPJ → conferir, com o motivo");
    ok(pag(3).status === "CONFERIR", "página com duas pessoas → conferir (não vai ao portal)");
    if (cnpjA) ok(pag(4).status === "GRAVADO" && pag(4).destinoEntidade === "ExameOcupacional", "ASO da Ana → exame ocupacional");
    ok(pag(5).status === "CONFERIR" && pag(5).tipo === "NAO_E_DE_COLABORADOR", "página sem pessoa → sugestão de descartar");

    if (cnpjA) {
      const cc = await prisma.documentoColaborador.findFirst({ where: { colaboradorId: ana.id, tipo: "CONTRACHEQUE" }, include: { arquivo: true } });
      ok(!!cc && cc.chaveDedupe === "CONTRACHEQUE:2026-08:MENSAL" && cc.empresaId === empA.id, "contracheque no Dossiê da Ana, com a chave de duplicata e o CNPJ da ficha");
      const fatia = cc?.arquivo?.conteudo ? await PDFDocument.load(cc.arquivo.conteudo) : null;
      ok(fatia?.getPageCount() === 1, "o arquivo da Ana tem 1 página — nunca a folha inteira");
      const exame = await prisma.exameOcupacional.findFirst({ where: { colaboradorId: ana.id } });
      ok(!!exame?.validoAte && exame.validoAte.toISOString().startsWith("2027-09-10"), "validade do ASO = realizado + 12 meses");
      ok(pag(1).cpfLido === null, "CPF lido some do item depois de gravado");
    }

    console.log("\n2. A mesma folha de novo:");
    const r2 = await novo();
    const reg2 = await registrarConteudo({ recebidoId: r2.id, empresaId: empA.id, bytes, mimeType: "application/pdf", blobUrl: null, usuario });
    ok(!reg2.ok && !!(reg2 as { duplicadoDe?: unknown }).duplicadoDe, "mesmo arquivo recusado como já enviado (não lê nem paga de novo)");

    if (cnpjA) {
      console.log("\n3. Contracheque repetido em outro arquivo:");
      const outraLeitura = { ...leitura, documentos: [leitura.documentos[0]] };
      const bytes3 = await pdfDeTeste(1, { paginas: [leitura.paginas[0]], documentos: outraLeitura.documentos });
      const r3 = await novo();
      await registrarConteudo({ recebidoId: r3.id, empresaId: empA.id, bytes: bytes3, mimeType: "application/pdf", blobUrl: null, usuario });
      for (let i = 0; i < 10; i++) {
        const p = await avancarRecebido(r3.id, usuario, extrator);
        if (!p || !["PENDENTE", "LENDO", "ROTEANDO"].includes(p.status)) break;
      }
      const item3 = await prisma.itemDocumentoRecebido.findFirst({ where: { recebidoId: r3.id } });
      ok(item3?.status === "CONFERIR" && (item3.motivo ?? "").includes("já está no Dossiê"), "o mesmo contracheque não entra duas vezes");
      const qtd = await prisma.documentoColaborador.count({ where: { colaboradorId: ana.id, tipo: "CONTRACHEQUE" } });
      ok(qtd === 1, "continua um só no Dossiê");
    }

    console.log("\n4. Pendências contam a fila:");
    const { pendenciasDaEmpresa } = await import("../lib/pendencias");
    // O arquivo foi enviado de A com escopo {A, B}.
    const doisCnpjs = await pendenciasDaEmpresa([empA.id], prisma, [empA.id, empB.id]);
    ok(doisCnpjs.caixaAConferir >= 3, `quem vê A e B, olhando só o CNPJ A (contador da lateral): ${doisCnpjs.caixaAConferir}`);
    const soA = await pendenciasDaEmpresa([empA.id], prisma, [empA.id]);
    ok(soA.caixaAConferir === 0, `quem só vê a empresa A não conta a fila de um arquivo de A+B que não consegue abrir (${soA.caixaAConferir})`);
    const semUsuario = await pendenciasDaEmpresa([empA.id]);
    ok(semUsuario.caixaAConferir === doisCnpjs.caixaAConferir, "sem saber quem pergunta, conta tudo do CNPJ");

    console.log("\n5. Documento que atravessa blocos, com outros encaminhados no meio (20 páginas, 3 blocos):");
    {
      const inv = (pagina: number, pessoas: number, ids: string[]) => ({ pagina, pessoas, identificadores: ids });
      const paginas = [
        ...Array.from({ length: 9 }, (_, i) => inv(i + 1, 1, [CPF_BRUNO])),
        inv(10, 1, [CPF_ANA]),
        inv(11, 1, [CPF_DE_FORA]),
        inv(12, 1, [CPF_ANA]),
        inv(13, 1, []), // alguém que a leitura não apontou em documento nenhum
        inv(14, 0, []),
        inv(15, 0, []),
        inv(16, 0, []),
        inv(17, 1, [CPF_ANA]),
        inv(18, 0, []),
        inv(19, 0, []),
        inv(20, 0, []),
      ];
      const documentos = [
        doc({ tipo: "CONTRATO", paginaInicio: 1, paginaFim: 8, continuaDepois: true, nome: "Bruno Lima Smoke", cpf: CPF_BRUNO, cnpjEmpregador: "" }),
        doc({ tipo: "CONTRATO", paginaInicio: 9, paginaFim: 9, continuaAntes: true, nome: "Bruno Lima Smoke", cpf: CPF_BRUNO, cnpjEmpregador: "" }),
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 10, paginaFim: 10, nome: "Ana Souza Smoke", cpf: CPF_ANA, cnpjEmpregador: cnpjA ? CNPJ_A : "", campos: { competencia: "2026-07", tipoFolha: "MENSAL" } }),
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 11, paginaFim: 11, nome: "Pessoa De Fora", cpf: CPF_DE_FORA, cnpjEmpregador: cnpjC ? CNPJ_B : "", campos: { competencia: "2026-07", tipoFolha: "MENSAL" } }),
        // O informe traz o CNPJ da matriz (fora do escopo) como fonte pagadora, mas o CPF é da Ana.
        doc({ tipo: "INFORME_RENDIMENTOS", paginaInicio: 12, paginaFim: 12, nome: "Ana Souza Smoke", cpf: CPF_ANA, cnpjEmpregador: cnpjC ? CNPJ_B : "", campos: { anoCalendario: 2025 } }),
        doc({ tipo: "CONTRACHEQUE", paginaInicio: 17, paginaFim: 17, nome: "Ana Souza Smoke", cpf: CPF_ANA, pis: PIS_ANA, cnpjEmpregador: "", campos: { competencia: "2026-06", tipoFolha: "MENSAL" } }),
      ];
      const bytes5 = await pdfDeTeste(20, { paginas, documentos });
      const r5 = await prisma.documentoRecebido.create({
        data: {
          empresaId: empA.id,
          empresasEscopo: [empA.id, empB.id],
          nome: "blocos-smoke.pdf",
          mimeType: "application/pdf",
          tamanhoBytes: bytes5.byteLength,
          hash: "",
          status: "AGUARDANDO_UPLOAD",
          criadoPorId: "smoke",
          criadoPorNome: "Smoke",
        },
      });
      await registrarConteudo({ recebidoId: r5.id, empresaId: empA.id, bytes: bytes5, mimeType: "application/pdf", blobUrl: null, usuario });
      for (let i = 0; i < 30; i++) {
        const p = await avancarRecebido(r5.id, usuario, extrator);
        if (!p || !["PENDENTE", "LENDO", "ROTEANDO"].includes(p.status)) break;
      }
      const fim5 = await progressoDe(r5.id);
      ok(fim5?.status === "CONCLUIDO", `arquivo concluído, sem travar na junção do último bloco (${fim5?.status}${fim5?.erro ? `: ${fim5.erro}` : ""})`);
      const itens5 = await prisma.itemDocumentoRecebido.findMany({ where: { recebidoId: r5.id }, orderBy: { paginaInicio: "asc" } });
      const contrato = itens5.filter((i) => i.tipo === "CONTRATO");
      ok(contrato.length === 1 && contrato[0].paginaInicio === 1 && contrato[0].paginaFim === 9, "o contrato das páginas 1–8 + 9 virou um só documento (1–9)");
      ok(itens5.every((i) => i.status !== "PENDENTE" && i.status !== "GRAVANDO"), "nenhum item ficou para trás na fila");
      const deFora = itens5.find((i) => i.paginaInicio === 11);
      const informe = itens5.find((i) => i.paginaInicio === 12);
      if (cnpjC) {
        ok(
          deFora?.status === "DESCARTADO" && !deFora.nomeLido && !deFora.cpfLido && (deFora.motivo ?? "").startsWith(MOTIVO_FORA_DO_ESCOPO),
          "documento de CNPJ fora do escopo, de ninguém daqui → descartado sem nome nem CPF guardados",
        );
        ok(
          informe?.status === "CONFERIR" && informe.colaboradorId === ana.id && (informe.motivo ?? "").includes("alguém daqui"),
          "informe com o CNPJ da matriz (fora do escopo) mas o CPF da Ana → conferência com a Ana sugerida",
        );
      }
      const solta = itens5.find((i) => i.paginaInicio === 13);
      ok(solta?.status === "CONFERIR" && (solta.motivo ?? "").includes("não apontou"), "página que a leitura pulou virou item para conferir");
      ok(itens5.filter((i) => i.paginaInicio === 14 || i.paginaInicio === 15).length === 0, "página sem pessoa (0 no inventário) não vira item");
      const ultimo = itens5.find((i) => i.paginaInicio === 17);
      ok(ultimo?.status === "CONFERIR" && ultimo.pisLido === PIS_ANA, "o PIS lido sobrevive à junção do último bloco");
      const r5b = await prisma.documentoRecebido.findUniqueOrThrow({ where: { id: r5.id } });
      const inventario = r5b.inventarioPaginas as InventarioPaginas;
      ok(inventario["10"]?.ids[0] === marcaDoId(CPF_ANA) && !JSON.stringify(inventario).includes(CPF_ANA), "inventário guarda marcas, nunca o CPF");

      const apagou = await apagarOriginal(r5.id);
      const r5c = await prisma.documentoRecebido.findUniqueOrThrow({ where: { id: r5.id } });
      const restoCpf = await prisma.itemDocumentoRecebido.count({ where: { recebidoId: r5.id, NOT: { cpfLido: null } } });
      ok(apagou && !r5c.arquivoId && r5c.inventarioPaginas === null && restoCpf === 0, "apagar o original leva junto o inventário e os CPFs lidos");
      ok(!(await apagarOriginal(r5.id)), "apagar de novo não quebra (já não há original)");
    }
  } finally {
    // Limpa tudo o que o teste criou (itens caem em cascata).
    const recebidos = await prisma.documentoRecebido.findMany({ where: { empresaId: empA.id }, select: { id: true, arquivoId: true } });
    await prisma.documentoRecebido.deleteMany({ where: { empresaId: empA.id } });
    const ids = [empA.id, empB.id, empC.id];
    await prisma.exameOcupacional.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.documentoColaborador.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.ausencia.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.certificadoNR.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.arquivo.deleteMany({ where: { OR: [{ empresaId: { in: ids } }, { id: { in: recebidos.map((r) => r.arquivoId).filter((x): x is string => !!x) } }] } });
    await prisma.auditLog.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.colaborador.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.posicao.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.setor.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
    await prisma.marca.delete({ where: { id: marca.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\nFumaça da Caixa de documentos: tudo certo." : `\n${falhas} verificação(ões) falharam.`);
    process.exit(falhas === 0 ? 0 : 1);
  });
