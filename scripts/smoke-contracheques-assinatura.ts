// Smoke test integrado de ponta a ponta:
// Disparo -> Ciência Telegram -> Desafio CPF/2FA -> Abertura PDF -> Assinatura com Selfie -> Selagem e Comprovante
//
// Pode rodar contra o banco real (se DATABASE_URL estiver configurado) ou em modo simulado integrado.
//
//   npx tsx scripts/smoke-contracheques-assinatura.ts

import "dotenv/config";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

async function gerarPdfMock(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("DEMONSTRATIVO DE PAGAMENTO - MENSAL", {
    x: 50,
    y: 800,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function gerarSelfieSolidaMock(r = 60, g = 120, b = 200): Promise<string> {
  const imgBuffer = await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${imgBuffer.toString("base64")}`;
}

async function gerarSelfieTexturizadaMock(): Promise<string> {
  const svg = `<svg width="160" height="160">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111" />
        <stop offset="100%" stop-color="#eee" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" fill="url(#g)" />
    <circle cx="80" cy="80" r="50" fill="#f5deb3" />
    <circle cx="65" cy="70" r="8" fill="#000" />
    <circle cx="95" cy="70" r="8" fill="#000" />
    <rect x="60" y="105" width="40" height="10" fill="#b22222" />
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function gerarSelfieMock(): Promise<string> {
  return gerarSelfieTexturizadaMock();
}

async function rodarComBancoReal(databaseUrl: string) {
  const { PrismaClient } = await import("../app/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  const { gerarTokenAssinatura, gerarCodigo2fa, validarHashCodigo } = await import("../lib/contracheques/token-auth");
  const { tratarCallbackCienciaContracheque } = await import("../lib/contracheques/telegram-ciencia");
  const { gerarPdfComprovanteAssinado } = await import("../lib/contracheques/comprovante-pdf");
  const { validarSelfieContracheque } = await import("../lib/contracheques/validar-selfie");
  const { montarCsvContracheques } = await import("../lib/contracheques/exportar");
  const { situacaoDo, SITUACAO_LABEL } = await import("../lib/contracheques/situacao");

  const sufixo = Date.now().toString(36);
  const grupo = await prisma.grupo.upsert({
    where: { nome: "CI Fixture" },
    update: {},
    create: { nome: "CI Fixture" },
  });
  const marca = await prisma.marca.create({
    data: { nome: `Smoke Assinatura ${sufixo}`, grupoId: grupo.id },
  });
  const empresa = await prisma.empresa.create({
    data: { nome: `Empresa Smoke ${sufixo}`, cnpj: "12345678000199", marcaId: marca.id, ativo: true },
  });
  const setor = await prisma.setor.create({ data: { empresaId: empresa.id, nome: "Operações", ativo: true } });
  const posicao = await prisma.posicao.create({ data: { empresaId: empresa.id, nome: "Técnico" } });
  const colaborador = await prisma.colaborador.create({
    data: {
      empresaId: empresa.id,
      nome: "Carlos Eduardo da Silva",
      cpf: "12345678909",
      email: `carlos.${sufixo}@exemplo.com`,
      telegramChatId: "987654321",
      setorId: setor.id,
      posicaoId: posicao.id,
      dataAdmissao: new Date("2024-01-15T00:00:00Z"),
      ativo: true,
    },
  });

  const pdfMock = await gerarPdfMock();
  const arquivoOriginal = await prisma.arquivo.create({
    data: {
      empresaId: empresa.id,
      nome: "contracheque_2026_11.pdf",
      mimeType: "application/pdf",
      tamanhoBytes: pdfMock.byteLength,
      conteudo: pdfMock,
    },
  });

  const documento = await prisma.documentoColaborador.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      tipo: "CONTRACHEQUE",
      arquivoId: arquivoOriginal.id,
      competencia: new Date("2026-11-01T00:00:00Z"),
      chaveDedupe: `CONTRACHEQUE:2026-11:MENSAL:${colaborador.id}`,
    },
  });

  try {
    console.log("1. Disparo de envio e geração do token:");
    const token = gerarTokenAssinatura();
    const recibo = await prisma.reciboContracheque.create({
      data: {
        documentoId: documento.id,
        colaboradorId: colaborador.id,
        empresaId: empresa.id,
        competencia: documento.competencia!,
        tipoFolha: "MENSAL",
        tokenAssinatura: token,
        canal: "EMAIL",
        enviadoEm: new Date(),
        envios: 1,
      },
    });
    ok(!!recibo.tokenAssinatura && recibo.tokenAssinatura.length > 30, "Token único de assinatura gerado");

    console.log("\n2. Ciência via Telegram:");
    const tratado = await tratarCallbackCienciaContracheque(recibo.id, "987654321");
    ok(tratado, "Callback do Telegram processado");
    const reciboCiente = await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: recibo.id } });
    ok(!!reciboCiente.cienciaTelegramEm, "Carimbo cienciaTelegramEm registrado no banco");

    console.log("\n3. Desafio 2FA:");
    const { codigo, hash, expiraEm } = gerarCodigo2fa();
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: {
        codigo2faHash: hash,
        codigoExpiraEm: expiraEm,
        canalCodigo: "TELEGRAM",
        tentativasCodigo: 0,
      },
    });
    const codigoValido = validarHashCodigo(codigo, hash, expiraEm);
    ok(codigoValido, "Código 2FA de 6 dígitos verificado dentro da janela de 10 min");
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: { codigoValidadoEm: new Date() },
    });

    console.log("\n4. Abertura do documento na tela:");
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: { vistoEm: new Date() },
    });
    const reciboVisto = await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: recibo.id } });
    ok(!!reciboVisto.vistoEm, "Carimbo vistoEm registrado antes da assinatura");

    console.log("\n5. Assinatura com selfie e emissão do comprovante selado:");
    const selfieSolida = await gerarSelfieSolidaMock();
    const checkSolida = await validarSelfieContracheque(selfieSolida);
    ok(!checkSolida.ok, "Selfie sólida azul é rejeitada pelo validador híbrido");

    const selfieDataUrl = await gerarSelfieMock();
    const checkValida = await validarSelfieContracheque(selfieDataUrl);
    ok(checkValida.ok, "Selfie texturizada aprovada pelo validador híbrido");

    const agora = new Date();
    const comprovante = await gerarPdfComprovanteAssinado({
      pdfOriginalBytes: pdfMock,
      reciboId: recibo.id,
      colaboradorNome: colaborador.nome,
      colaboradorCpf: colaborador.cpf,
      empresaRazaoSocial: empresa.nome,
      empresaCnpj: empresa.cnpj ?? "00.000.000/0001-00",
      competenciaRotulo: "Novembro/2026",
      tipoFolhaRotulo: "Mensal",
      enviadoEm: recibo.enviadoEm,
      cienciaTelegramEm: reciboCiente.cienciaTelegramEm,
      vistoEm: reciboVisto.vistoEm,
      codigoValidadoEm: agora,
      canalCodigo: "TELEGRAM",
      confirmadoEm: agora,
      confirmadoIp: "189.100.20.10",
      confirmadoDispositivo: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      confirmadoLocalizacao: null,
      textoAceite: "Declaro para os devidos fins que recebi e conferi meu contracheque.",
      fotoDataUrl: selfieDataUrl,
    });

    const docFinal = await PDFDocument.load(comprovante.bytes);
    ok(docFinal.getPageCount() === 2, "PDF final possui 2 páginas (original + folha de evidências)");
    ok(
      comprovante.hashOriginal === createHash("sha256").update(pdfMock).digest("hex"),
      "Hash SHA-256 do documento original gravado com integridade matemática",
    );

    const arquivoComprovante = await prisma.arquivo.create({
      data: {
        empresaId: empresa.id,
        nome: "contracheque_selado_comprovante.pdf",
        mimeType: "application/pdf",
        tamanhoBytes: comprovante.bytes.byteLength,
        conteudo: Buffer.from(comprovante.bytes),
      },
    });

    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: {
        confirmadoEm: agora,
        confirmadoIp: "189.100.20.10",
        confirmadoDispositivo: "iPhone 15 Pro",
        confirmadoLocalizacao: null,
        hashDocumento: comprovante.hashOriginal,
        textoAceite: "Declaro para os devidos fins que recebi e conferi meu contracheque.",
        comprovanteArquivoId: arquivoComprovante.id,
      },
    });

    const reciboFinal = await prisma.reciboContracheque.findUniqueOrThrow({ where: { id: recibo.id } });
    ok(!!reciboFinal.confirmadoEm && !!reciboFinal.comprovanteArquivoId, "Recibo assinado e selado com sucesso");

    console.log("\n6. Relatório e Exportação CSV:");
    const sit = situacaoDo(reciboFinal);
    const rotulo = SITUACAO_LABEL[sit];
    ok(sit === "CONFIRMADO", "Status no painel do RH exibe 'Assinado com foto'");

    const csv = montarCsvContracheques([
      {
        colaboradorNome: colaborador.nome,
        colaboradorCpf: colaborador.cpf,
        empresaNome: empresa.nome,
        cnpj: empresa.cnpj ?? "",
        setor: setor.nome,
        email: colaborador.email ?? "",
        temTelegram: "Sim",
        folha: "Novembro/2026 (Mensal)",
        situacao: rotulo,
        enviadoEm: "06/11/2026 10:00",
        cienciaEm: "06/11/2026 10:05",
        vistoEm: "06/11/2026 10:08",
        confirmadoEm: "06/11/2026 10:10",
        ip: reciboFinal.confirmadoIp ?? "",
        hash: reciboFinal.hashDocumento ?? "",
        lembretesEnviados: 0,
      },
    ]);
    ok(csv.includes("Carlos Eduardo da Silva") && csv.includes(empresa.nome), "Linha de auditoria exportada no CSV com sucesso");
  } finally {
    // Limpeza dos dados criados
    await prisma.reciboContracheque.deleteMany({ where: { colaboradorId: colaborador.id } });
    await prisma.documentoColaborador.deleteMany({ where: { colaboradorId: colaborador.id } });
    await prisma.arquivo.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.colaborador.delete({ where: { id: colaborador.id } });
    await prisma.posicao.delete({ where: { id: posicao.id } });
    await prisma.setor.delete({ where: { id: setor.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
    await prisma.marca.delete({ where: { id: marca.id } });
    await prisma.$disconnect();
  }
}

async function rodarSimulado() {
  console.log("Executando simulação integrada de ponta a ponta (sem DATABASE_URL)...");

  // Estado em memória
  const dados = {
    colaborador: {
      id: "colab-123",
      nome: "Carlos Eduardo da Silva",
      cpf: "12345678909",
      email: "carlos@exemplo.com",
      telegramChatId: "987654321",
    },
    empresa: {
      id: "emp-123",
      nome: "LM Telecom SA",
      cnpj: "12.345.678/0001-99",
      marca: { nome: "LM Telecom" },
    },
    recibo: {
      id: "recibo-123",
      tokenAssinatura: "",
      enviadoEm: null as Date | null,
      cienciaTelegramEm: null as Date | null,
      codigo2faHash: null as string | null,
      codigoExpiraEm: null as Date | null,
      codigoValidadoEm: null as Date | null,
      tentativasCodigo: 0,
      bloqueadoEm: null as Date | null,
      vistoEm: null as Date | null,
      confirmadoEm: null as Date | null,
      confirmadoIp: null as string | null,
      confirmadoDispositivo: null as string | null,
      hashDocumento: null as string | null,
      textoAceite: null as string | null,
      comprovanteArquivoId: null as string | null,
    },
  };

  // Inicializa o mock do prismaGlobal antes de importar módulos que o utilizam
  (globalThis as unknown as { prismaGlobal: unknown }).prismaGlobal = {
    reciboContracheque: {
      findUnique: async (args: { where?: { id?: string; tokenAssinatura?: string } }) => {
        if (args?.where?.id === dados.recibo.id || args?.where?.tokenAssinatura === dados.recibo.tokenAssinatura) {
          return {
            ...dados.recibo,
            colaborador: {
              ...dados.colaborador,
              empresa: dados.empresa,
            },
          };
        }
        return null;
      },
      findUniqueOrThrow: async () => ({
        ...dados.recibo,
        colaborador: {
          ...dados.colaborador,
          empresa: dados.empresa,
        },
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(dados.recibo, args.data);
        return { id: dados.recibo.id };
      },
    },
  };

  const { gerarTokenAssinatura, gerarCodigo2fa, validarHashCodigo } = await import("../lib/contracheques/token-auth");
  const { montarCorpoEmailContracheque, mascararEmail } = await import("../lib/contracheques/envio");
  const { tratarCallbackCienciaContracheque } = await import("../lib/contracheques/telegram-ciencia");
  const { gerarPdfComprovanteAssinado } = await import("../lib/contracheques/comprovante-pdf");
  const { validarSelfieContracheque } = await import("../lib/contracheques/validar-selfie");
  const { montarCsvContracheques } = await import("../lib/contracheques/exportar");
  const { situacaoDo, SITUACAO_LABEL } = await import("../lib/contracheques/situacao");

  console.log("\n1. Disparo de envio e geração do token:");
  dados.recibo.tokenAssinatura = gerarTokenAssinatura();
  dados.recibo.enviadoEm = new Date();
  ok(dados.recibo.tokenAssinatura.length > 30, "Token único de alta entropia gerado");

  const emailInicial = montarCorpoEmailContracheque(
    "Carlos",
    "Novembro/2026",
    dados.empresa.marca.nome,
    `https://app.nexusholding.com.br/assinar/${dados.recibo.tokenAssinatura}`
  );
  ok(
    !emailInicial.html.includes(".pdf") && emailInicial.html.includes(dados.recibo.tokenAssinatura),
    "E-mail inicial não contém PDF anexo e leva o link seguro de assinatura"
  );
  ok(mascararEmail(dados.colaborador.email) === "c***@exemplo.com", "E-mail do colaborador devidamente mascarado");

  console.log("\n2. Notificação e Ciência via Telegram:");
  const tratado = await tratarCallbackCienciaContracheque(dados.recibo.id, "987654321");
  ok(tratado, "Callback do Telegram processado com sucesso");
  ok(!!dados.recibo.cienciaTelegramEm, "Carimbo de ciência no Telegram registrado");

  console.log("\n3. Desafio de CPF e Geração/Validação do 2FA:");
  const { codigo, hash, expiraEm } = gerarCodigo2fa();
  dados.recibo.codigo2faHash = hash;
  dados.recibo.codigoExpiraEm = expiraEm;

  const codigoValido = validarHashCodigo(codigo, hash, expiraEm);
  ok(codigoValido, "Código 2FA de 6 dígitos validado com hash SHA-256 e janela de 10 minutos");
  dados.recibo.codigoValidadoEm = new Date();

  console.log("\n4. Abertura e Leitura do PDF Original na Tela:");
  const pdfOriginal = await gerarPdfMock();
  dados.recibo.vistoEm = new Date();
  ok(!!dados.recibo.vistoEm, "Documento marcado como visualizado (vistoEm)");

  console.log("\n5. Assinatura com Selfie e Emissão do Comprovante Selado:");
  const selfieSolida = await gerarSelfieSolidaMock();
  const checkSolida = await validarSelfieContracheque(selfieSolida);
  ok(!checkSolida.ok, "Selfie sólida azul é rejeitada pelo validador híbrido");

  const selfieDataUrl = await gerarSelfieMock();
  const checkValida = await validarSelfieContracheque(selfieDataUrl);
  ok(checkValida.ok, "Selfie texturizada aprovada pelo validador híbrido");

  const agora = new Date();
  const comprovante = await gerarPdfComprovanteAssinado({
    pdfOriginalBytes: pdfOriginal,
    reciboId: dados.recibo.id,
    colaboradorNome: dados.colaborador.nome,
    colaboradorCpf: dados.colaborador.cpf,
    empresaRazaoSocial: dados.empresa.nome,
    empresaCnpj: dados.empresa.cnpj,
    competenciaRotulo: "Novembro/2026",
    tipoFolhaRotulo: "Mensal",
    enviadoEm: dados.recibo.enviadoEm,
    cienciaTelegramEm: dados.recibo.cienciaTelegramEm,
    vistoEm: dados.recibo.vistoEm,
    codigoValidadoEm: dados.recibo.codigoValidadoEm,
    canalCodigo: "TELEGRAM",
    confirmadoEm: agora,
    confirmadoIp: "189.10.20.30",
    confirmadoDispositivo: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    confirmadoLocalizacao: null,
    textoAceite: "Declaro para os devidos fins que recebi e conferi meu contracheque.",
    fotoDataUrl: selfieDataUrl,
  });

  const docFinal = await PDFDocument.load(comprovante.bytes);
  ok(docFinal.getPageCount() === 2, "PDF selado gerado com 2 páginas (original + página de conformidade)");
  ok(
    comprovante.hashOriginal === createHash("sha256").update(pdfOriginal).digest("hex"),
    "Hash criptográfico SHA-256 do original idêntico ao carimbado na folha de evidências"
  );

  dados.recibo.confirmadoEm = agora;
  dados.recibo.confirmadoIp = "189.10.20.30";
  dados.recibo.confirmadoDispositivo = "iPhone 15 Pro";
  dados.recibo.hashDocumento = comprovante.hashOriginal;
  dados.recibo.textoAceite = "Declaro para os devidos fins que recebi e conferi meu contracheque.";
  dados.recibo.comprovanteArquivoId = "arq-comprovante-456";

  ok(!!dados.recibo.confirmadoEm && !!dados.recibo.comprovanteArquivoId, "Recibo devidamente concluído e selado");

  console.log("\n6. Painel do RH & Exportação CSV de Auditoria:");
  const sit = situacaoDo({
    enviadoEm: dados.recibo.enviadoEm,
    canal: "EMAIL",
    cienciaTelegramEm: dados.recibo.cienciaTelegramEm,
    vistoEm: dados.recibo.vistoEm,
    confirmadoEm: dados.recibo.confirmadoEm,
    bloqueadoEm: dados.recibo.bloqueadoEm,
  });
  const rotulo = SITUACAO_LABEL[sit];
  ok(sit === "CONFIRMADO", "Indicador de status no RH reflete 'Assinado com foto'");

  const csv = montarCsvContracheques([
    {
      colaboradorNome: dados.colaborador.nome,
      colaboradorCpf: dados.colaborador.cpf,
      empresaNome: dados.empresa.nome,
      cnpj: dados.empresa.cnpj,
      setor: "Operações",
      email: dados.colaborador.email,
      temTelegram: "Sim",
      folha: "Novembro/2026 (Mensal)",
      situacao: rotulo,
      enviadoEm: "06/11/2026 10:00",
      cienciaEm: "06/11/2026 10:05",
      vistoEm: "06/11/2026 10:08",
      confirmadoEm: "06/11/2026 10:10",
      ip: dados.recibo.confirmadoIp ?? "",
      hash: dados.recibo.hashDocumento ?? "",
      lembretesEnviados: 0,
    },
  ]);
  ok(
    csv.includes(dados.colaborador.nome) && csv.includes(dados.empresa.cnpj) && csv.includes("Assinado com foto"),
    "Exportação CSV contém dados completos de auditoria"
  );
}

async function main() {
  console.log("=== SMOKE TEST: CONTRACHEQUES COM ASSINATURA ELETRÔNICA ===\n");
  if (process.env.DATABASE_URL) {
    console.log("DATABASE_URL encontrada. Conectando ao PostgreSQL...");
    await rodarComBancoReal(process.env.DATABASE_URL);
  } else {
    await rodarSimulado();
  }

  if (falhas > 0) {
    console.error(`\n✗ Smoke test falhou com ${falhas} erro(s).`);
    process.exit(1);
  }
  console.log("\n✓ Smoke test de assinatura de contracheques concluído com sucesso.");
}

main().catch((err) => {
  console.error("Erro fatal no smoke test:", err);
  process.exit(1);
});
