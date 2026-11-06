import { montarCsvContracheques } from "../lib/contracheques/exportar";

async function test() {
  console.log("1. Testando geração de CSV com formatação brasileira e BOM:");
  const csv = montarCsvContracheques([
    {
      colaboradorNome: "Ana Silva",
      colaboradorCpf: "123.456.789-00",
      empresaNome: "LM Telecom",
      cnpj: "12.345.678/0001-90",
      setor: "Operações",
      email: "ana@exemplo.com",
      temTelegram: "Sim",
      folha: "11/2026",
      situacao: "Confirmado com foto",
      enviadoEm: "06/11/2026 10:00",
      cienciaEm: "06/11/2026 10:15",
      vistoEm: "06/11/2026 10:20",
      confirmadoEm: "06/11/2026 10:30",
      ip: "189.10.20.30",
      hash: "a".repeat(64),
      lembretesEnviados: 0,
    },
  ]);

  if (!csv.startsWith("\uFEFF")) {
    throw new Error("CSV deve começar com BOM UTF-8 para Excel em português");
  }
  if (!csv.includes("Ana Silva") || !csv.includes("LM Telecom") || !csv.includes("Confirmado com foto")) {
    throw new Error("CSV não contém os dados esperados do colaborador");
  }
  if (!csv.includes("12.345.678/0001-90") || !csv.includes("189.10.20.30")) {
    throw new Error("CSV deve conter CNPJ e IP");
  }
  console.log("  ✓ Cabeçalho e linhas do CSV validados com sucesso");

  console.log("\nTodos os testes de exportar passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-painel-rh:", e);
  process.exit(1);
});
