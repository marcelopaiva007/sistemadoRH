// Mock do prismaGlobal antes de qualquer import para testes unitários das actions
(globalThis as unknown as { prismaGlobal: unknown }).prismaGlobal = {
  reciboContracheque: {
    findUnique: async (args: { where?: { tokenAssinatura?: string } }) => {
      if (args?.where?.tokenAssinatura === "token-inexistente-xyz") return null;
      if (args?.where?.tokenAssinatura === "token-bloqueado") {
        return {
          id: "recibo-bloqueado",
          tokenAssinatura: "token-bloqueado",
          bloqueadoEm: new Date(),
          tentativasCodigo: 5,
          confirmadoEm: null,
          colaborador: {
            nome: "Carlos Silva",
            cpf: "11122233344",
            email: "carlos@exemplo.com",
            empresa: { nome: "LM Telecom", marca: { nome: "LM Telecom" } },
          },
        };
      }
      if (args?.where?.tokenAssinatura === "token-valido") {
        return {
          id: "recibo-valido",
          tokenAssinatura: "token-valido",
          bloqueadoEm: null,
          tentativasCodigo: 0,
          confirmadoEm: null,
          competencia: new Date("2026-11-01T00:00:00Z"),
          tipoFolha: "MENSAL",
          colaborador: {
            nome: "Carlos Silva",
            cpf: "11122233344",
            email: "carlos@exemplo.com",
            telegramChatId: "12345678",
            empresa: { nome: "LM Telecom", marca: { nome: "LM Telecom" } },
          },
        };
      }
      return null;
    },
    update: async () => ({ id: "recibo-atualizado" }),
  },
};

async function test() {
  const {
    solicitarCodigo2faAction,
    validarCpfAssinaturaAction,
    assinarContrachequeAction,
    obterDadosReciboPublicoAction,
  } = await import("../lib/actions/assinatura-contracheque");

  console.log("1. Testando chamada com token inexistente:");
  const r0 = await obterDadosReciboPublicoAction("token-inexistente-xyz");
  if (r0.encontrado) throw new Error("Token inexistente não deve ser encontrado");
  console.log("  ✓ Token inexistente tratado como 404");

  console.log("\n2. Testando solicitar 2FA com token inexistente:");
  const r1 = await solicitarCodigo2faAction("token-inexistente-xyz", "12345678900");
  if (r1.ok) throw new Error("Token inexistente não pode solicitar 2FA");
  console.log("  ✓ Recusa de 2FA para token inválido");

  console.log("\n3. Testando token bloqueado:");
  const rBloq = await solicitarCodigo2faAction("token-bloqueado", "11122233344");
  if (rBloq.ok || !rBloq.bloqueado) throw new Error("Token bloqueado deve retornar bloqueado: true");
  console.log("  ✓ Bloqueio de segurança respeitado");

  console.log("\n4. Testando CPF divergente em token válido:");
  const rCpfErrado = await validarCpfAssinaturaAction("token-valido", "00000000000");
  if (rCpfErrado.ok) throw new Error("CPF errado não pode prosseguir");
  console.log("  ✓ CPF divergente recusado com incremento de tentativa");

  console.log("\n4.1. Testando CPF correto em token válido (fluxo simplificado sem 2FA):");
  const rCpfCorreto = await validarCpfAssinaturaAction("token-valido", "11122233344");
  if (!rCpfCorreto.ok) throw new Error("CPF correto deve autenticar com sucesso");
  console.log("  ✓ CPF correto autentica diretamente e emite sessão");

  console.log("\n5. Testando assinar sem aceite ou foto inválida:");
  const r3 = await assinarContrachequeAction("token-inexistente-xyz", {
    fotoDataUrl: "data:image/jpeg;base64,invalid",
    aceite: false,
    localizacao: null,
  });
  if (r3.ok) throw new Error("Assinatura sem aceite e sem sessão deve falhar");
  console.log("  ✓ Assinatura rejeitada com sucesso para parâmetros inválidos");

  console.log("\n5.1. Testando assinar com selfie sólida azul em sessão autenticada:");
  const sharp = (await import("sharp")).default;
  const azulBuf = await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: { r: 60, g: 120, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  const selfieAzul = `data:image/jpeg;base64,${azulBuf.toString("base64")}`;

  const rAzul = await assinarContrachequeAction("token-valido", {
    fotoDataUrl: selfieAzul,
    aceite: true,
    localizacao: null,
  });
  if (rAzul.ok) throw new Error("Assinatura com selfie sólida azul não pode ser aceita");
  if (!rAzul.error.includes("câmera coberta") && !rAzul.error.includes("branco, escura ou sem nitidez")) {
    throw new Error(`Mensagem de erro esperada sobre imagem sem nitidez, veio: ${rAzul.error}`);
  }
  console.log("  ✓ Selfie sólida azul recusada na action com orientação amigável");

  console.log("\n5.2. Testando guarda de sessão estrita (token sem autenticação prévia):");
  const rSemSessao = await assinarContrachequeAction("token-valido-sem-sessao", {
    fotoDataUrl: selfieAzul,
    aceite: true,
    localizacao: null,
  });
  if (rSemSessao.ok) throw new Error("Assinatura sem autenticação prévia não pode prosseguir");
  if (!rSemSessao.error.includes("Sessão expirada ou não autenticada")) {
    throw new Error(`Esperava erro de sessão não autenticada, veio: ${rSemSessao.error}`);
  }
  console.log("  ✓ Token sem cookie de sessão é estritamente rejeitado");

  console.log("\n5.3. Testando que NODE_ENV=production bloqueia fallback de cookie em memória:");
  const envOriginal = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const rProd = await assinarContrachequeAction("token-valido", {
      fotoDataUrl: selfieAzul,
      aceite: true,
      localizacao: null,
    });
    if (rProd.ok) throw new Error("Em production sem cookies HTTP, não pode usar fallback em memória");
    if (!rProd.error.includes("Sessão expirada ou não autenticada")) {
      throw new Error(`Esperava rejeição por falta de sessão em production, veio: ${rProd.error}`);
    }
    console.log("  ✓ Fallback em memória estritamente desabilitado quando NODE_ENV=production");
  } finally {
    process.env.NODE_ENV = envOriginal;
  }

  console.log("\nTodos os testes de guarda de assinatura-contracheque passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-assinatura-action:", e);
  process.exit(1);
});
