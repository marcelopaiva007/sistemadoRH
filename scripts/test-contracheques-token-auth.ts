import {
  gerarCodigo2fa,
  gerarTokenAssinatura,
  validarHashCodigo,
  normalizarCpf,
  compararCpf,
  gerarAssinaturaSessao,
  verificarAssinaturaSessao,
  linkAssinaturaNoPrazo,
} from "../lib/contracheques/token-auth";

async function test() {
  console.log("1. Testando geração de tokens:");
  const token1 = gerarTokenAssinatura();
  const token2 = gerarTokenAssinatura();
  if (!token1 || token1.length < 32 || token1 === token2) throw new Error("Geração de token inválida");
  console.log("  ✓ Tokens únicos e com entropia adequada");

  console.log("\n2. Testando código 2FA e expiração:");
  const { codigo, hash, expiraEm } = gerarCodigo2fa();
  if (!/^\d{6}$/.test(codigo)) throw new Error("Código 2FA deve ter exatamente 6 dígitos numéricos");
  if (!hash || hash.length !== 64) throw new Error("Hash SHA-256 do código deve ter 64 caracteres hexadecimais");
  
  const agora = new Date();
  if (expiraEm.getTime() <= agora.getTime()) throw new Error("Expiração do código deve ser no futuro");
  
  const deltaMin = (expiraEm.getTime() - agora.getTime()) / (60 * 1000);
  if (deltaMin < 9.9 || deltaMin > 10.1) throw new Error(`Expiração esperada em 10 min, obtido: ${deltaMin} min`);

  if (!validarHashCodigo(codigo, hash, expiraEm, agora)) throw new Error("Código correto dentro do prazo deve ser aceito");
  if (validarHashCodigo("000000", hash, expiraEm, agora)) throw new Error("Código incorreto deve ser recusado");
  
  const futuroExpirado = new Date(expiraEm.getTime() + 1000);
  if (validarHashCodigo(codigo, hash, expiraEm, futuroExpirado)) throw new Error("Código expirado deve ser recusado");
  console.log("  ✓ Validação do hash SHA-256 e janela de 10 min aprovada");

  console.log("\n3. Testando comparação de CPF:");
  if (normalizarCpf("123.456.789-00") !== "12345678900") throw new Error("Falha ao normalizar CPF");
  if (!compararCpf("123.456.789-00", "12345678900")) throw new Error("CPFs equivalentes devem bater");
  if (compararCpf("123.456.789-00", "98765432100")) throw new Error("CPFs diferentes não devem bater");
  console.log("  ✓ Normalização e comparação de CPF aprovada");

  console.log("\n4. Testando assinatura criptográfica de sessão temporária:");
  const segredo = "segredo-de-teste-12345678901234567890";
  const cookie = gerarAssinaturaSessao(token1, segredo);
  if (!verificarAssinaturaSessao(token1, cookie, segredo)) throw new Error("Cookie assinado deve ser válido");
  if (verificarAssinaturaSessao(token2, cookie, segredo)) throw new Error("Cookie assinado para token1 não pode valer para token2");
  if (verificarAssinaturaSessao(token1, cookie + "tamper", segredo)) throw new Error("Cookie adulterado não pode ser aceito");
  console.log("  ✓ Assinatura HMAC de sessão aprovada");

  console.log("\n5. Testando a chave padrão do cookie (sem texto fixo, falha fechada):");
  const envSessao = process.env.SESSION_SECRET;
  const envAuth = process.env.AUTH_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_SECRET;
    let estourou = false;
    try {
      gerarAssinaturaSessao(token1);
    } catch {
      estourou = true;
    }
    if (!estourou) throw new Error("Sem SESSION_SECRET nem AUTH_SECRET a assinatura deve falhar fechada");

    process.env.AUTH_SECRET = "auth-secret-de-teste";
    const derivado = gerarAssinaturaSessao(token1);
    if (!verificarAssinaturaSessao(token1, derivado)) throw new Error("Cookie com chave derivada deve conferir");
    if (derivado === gerarAssinaturaSessao(token1, "auth-secret-de-teste")) {
      throw new Error("O AUTH_SECRET cru não pode ser a chave — precisa da derivação com rótulo");
    }
    process.env.SESSION_SECRET = "session-secret-de-teste";
    if (gerarAssinaturaSessao(token1) !== gerarAssinaturaSessao(token1, "session-secret-de-teste")) {
      throw new Error("SESSION_SECRET, quando existe, tem precedência");
    }
  } finally {
    if (envSessao === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = envSessao;
    if (envAuth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = envAuth;
  }
  console.log("  ✓ SESSION_SECRET > chave derivada do AUTH_SECRET > erro");

  console.log("\n6. Testando prazo do link:");
  const agoraPrazo = new Date();
  const dia = 24 * 60 * 60 * 1000;
  if (!linkAssinaturaNoPrazo({ enviadoEm: new Date(agoraPrazo.getTime() - 119 * dia), createdAt: new Date(0) }, agoraPrazo)) {
    throw new Error("Link enviado há 119 dias ainda vale");
  }
  if (linkAssinaturaNoPrazo({ enviadoEm: new Date(agoraPrazo.getTime() - 121 * dia), createdAt: agoraPrazo }, agoraPrazo)) {
    throw new Error("Link enviado há 121 dias não vale mais");
  }
  if (linkAssinaturaNoPrazo({ enviadoEm: null, createdAt: new Date(agoraPrazo.getTime() - 121 * dia) }, agoraPrazo)) {
    throw new Error("Sem envio, conta da criação do recibo");
  }
  console.log("  ✓ Prazo de 120 dias contado do último envio");

  console.log("\nTodos os testes de token-auth passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-token-auth:", e.message);
  process.exit(1);
});
