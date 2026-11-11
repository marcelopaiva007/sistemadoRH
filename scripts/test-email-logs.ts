// Teste TDD para Frente 4: Logs SMTP, Helpers e Restrições de Envio
import assert from "node:assert";

// Mock de prismaGlobal antes de qualquer importação de lib/email
const logsCriados: Array<Record<string, unknown>> = [];
let contagemEnviados = 0;
let mockSuprimido: { motivo: string } | null = null;

(globalThis as unknown as { prismaGlobal: unknown }).prismaGlobal = {
  emailEnviado: {
    create: async (args: { data: Record<string, unknown> }) => {
      logsCriados.push(args.data);
      return { id: `log-${logsCriados.length}`, ...args.data };
    },
    count: async () => contagemEnviados,
    findFirst: async () => null,
  },
  emailSuprimido: {
    findUnique: async () => mockSuprimido,
  },
  segredoApp: {
    findUnique: async () => null,
  },
};

async function main() {
  console.log("▶ Iniciando testes TDD de logs SMTP e helpers...");

  // Importa dinamicamente após setar prismaGlobal
  const {
    intervaloBrasiliaParaDate,
    inicioDoDiaBrasiliaDe,
    montarCsvLogsEmail,
    sendEmail,
  } = await import("@/lib/email");

  // 1. intervaloBrasiliaParaDate
  console.log("  [1/4] Testando intervaloBrasiliaParaDate e inicioDoDiaBrasiliaDe...");
  const [inicio, fim] = intervaloBrasiliaParaDate("2026-11-09", "2026-11-10");
  assert.strictEqual(
    inicio.toISOString(),
    "2026-11-09T03:00:00.000Z",
    "Início de 2026-11-09 deve ser 2026-11-09T03:00:00.000Z"
  );
  assert.strictEqual(
    fim.toISOString(),
    "2026-11-11T03:00:00.000Z",
    "Fim exclusivo de 2026-11-10 deve ser 2026-11-11T03:00:00.000Z"
  );

  const diaInicio = inicioDoDiaBrasiliaDe("2026-11-09");
  assert.strictEqual(
    diaInicio.toISOString(),
    "2026-11-09T03:00:00.000Z",
    "inicioDoDiaBrasiliaDe deve retornar 03:00:00.000Z"
  );

  // 2. montarCsvLogsEmail
  console.log("  [2/4] Testando montarCsvLogsEmail...");
  const csv = montarCsvLogsEmail([
    {
      dataHoraBrasilia: "09/11/2026 14:30:00",
      destinatario: "teste@empresa.com",
      origem: "CONTRACHEQUE",
      assunto: "Contracheque de Outubro/2026; Folha Mensal",
      marca: "LM Telecom",
      empresa: 'LM "Fibra" SP',
      status: "ENVIADO",
      erro: "",
    },
    {
      dataHoraBrasilia: "10/11/2026 09:15:00",
      destinatario: "invalido@sem-dominio",
      origem: "DELEGACOES",
      assunto: "Aviso de demanda\nCom quebra de linha",
      marca: "",
      empresa: "",
      status: "INVALIDO",
      erro: "E-mail inválido",
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"), "CSV deve começar com BOM UTF-8 (\\uFEFF)");
  const linhasCsv = csv.replace("\uFEFF", "").split("\r\n");
  assert.strictEqual(
    linhasCsv[0],
    "Data/Hora (Brasília);Destinatário;Origem;Assunto;Marca;Empresa;Status;Erro",
    "Cabeçalho CSV deve ter as colunas exatas separadas por ponto-e-vírgula"
  );
  assert.ok(
    linhasCsv[1].includes('"Contracheque de Outubro/2026; Folha Mensal"'),
    "Ponto-e-vírgula no assunto deve ser escapado com aspas"
  );
  assert.ok(
    linhasCsv[1].includes('"LM ""Fibra"" SP"'),
    "Aspas duplas na empresa devem ser escapadas como duplas"
  );
  assert.ok(
    csv.includes('"Aviso de demanda\nCom quebra de linha"'),
    "Quebras de linha devem ser mantidas entre aspas no CSV"
  );

  // 3. Simulações sendEmail
  console.log("  [3/4] Testando sendEmail com mock de prismaGlobal...");

  // Configura variáveis SMTP simuladas
  process.env.SMTP_HOST = "smtp.test.local";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "rh@test.local";
  process.env.SMTP_PASS = "segredo-mock";
  process.env.EMAIL_FROM = "RH Teste <rh@test.local>";

  logsCriados.length = 0;
  contagemEnviados = 0;
  mockSuprimido = null;

  // 3a. E-mail inválido
  const rInvalido = await sendEmail({
    to: "sem-arroba",
    subject: "Teste Invalido",
    html: "<p>Olá</p>",
    origem: "CONTRACHEQUE",
    empresaId: "emp-1",
    marcaNome: "Marca Teste",
  });
  assert.strictEqual(rInvalido.ok, false);
  assert.strictEqual((rInvalido as { motivo: string }).motivo, "INVALIDO");
  assert.strictEqual(logsCriados.length, 1, "Deve gravar 1 log em emailEnviado para inválido");
  assert.strictEqual(logsCriados[0].status, "INVALIDO");
  assert.strictEqual(logsCriados[0].ok, false);
  assert.strictEqual(logsCriados[0].origem, "CONTRACHEQUE");
  assert.strictEqual(logsCriados[0].empresaId, "emp-1");
  assert.strictEqual(logsCriados[0].marcaNome, "Marca Teste");

  // 3b. E-mail suprimido
  logsCriados.length = 0;
  mockSuprimido = { motivo: "HARD_BOUNCE" };
  const rSuprimido = await sendEmail({
    to: "suprimido@exemplo.com",
    subject: "Teste Suprimido",
    html: "<p>Olá</p>",
    origem: "CONVITE_PESQUISA",
  });
  assert.strictEqual(rSuprimido.ok, false);
  assert.strictEqual((rSuprimido as { motivo: string }).motivo, "SUPRIMIDO");
  assert.strictEqual(logsCriados.length, 1, "Deve gravar 1 log em emailEnviado para suprimido");
  assert.strictEqual(logsCriados[0].status, "SUPRIMIDO");
  assert.strictEqual(logsCriados[0].ok, false);
  assert.strictEqual(logsCriados[0].origem, "CONVITE_PESQUISA");
  mockSuprimido = null;

  // 3c. Bloqueado pelo teto (85)
  logsCriados.length = 0;
  contagemEnviados = 85;
  const rTeto = await sendEmail({
    to: "valido@exemplo.com",
    subject: "Teste Teto",
    html: "<p>Olá</p>",
    origem: "DELEGACOES",
  });
  assert.strictEqual(rTeto.ok, false);
  assert.strictEqual((rTeto as { motivo: string }).motivo, "COTA");
  assert.strictEqual(logsCriados.length, 1, "Deve gravar 1 log em emailEnviado para teto");
  assert.strictEqual(logsCriados[0].status, "BLOQUEADO_TETO");
  assert.strictEqual(logsCriados[0].ok, false);
  assert.strictEqual(logsCriados[0].origem, "DELEGACOES");

  // 4. Falta de SMTP config não grava log
  console.log("  [4/4] Testando ausência de SMTP (CONFIG) sem gravar log...");
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  logsCriados.length = 0;
  const rConfig = await sendEmail({
    to: "qualquer@exemplo.com",
    subject: "Teste Sem Config",
    html: "<p>Olá</p>",
  });
  assert.strictEqual(rConfig.ok, false);
  assert.strictEqual((rConfig as { motivo: string }).motivo, "CONFIG");
  assert.strictEqual(logsCriados.length, 0, "Sem config SMTP não deve gravar em emailEnviado");

  console.log("✔ Todos os testes de email logs passaram com sucesso!");
}

main().catch((err) => {
  console.error("❌ Falha no teste:", err);
  process.exit(1);
});
