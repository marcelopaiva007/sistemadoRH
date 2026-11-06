import { Prisma } from "../app/generated/prisma/client";

async function run() {
  console.log("Validando campos de assinatura no Prisma...");
  const fieldNames = Object.keys(Prisma.ReciboContrachequeScalarFieldEnum);
  const required = [
    "tokenAssinatura",
    "codigo2faHash",
    "codigoExpiraEm",
    "canalCodigo",
    "codigoValidadoEm",
    "tentativasCodigo",
    "bloqueadoEm",
    "cienciaTelegramEm",
    "lembretesEnviados",
    "ultimoLembreteEm",
    "confirmadoLocalizacao",
    "textoAceite",
    "comprovanteArquivoId",
  ];
  for (const req of required) {
    if (!fieldNames.includes(req)) throw new Error(`Campo ausente no schema: ${req}`);
  }
  console.log("✓ Todos os campos de assinatura presentes no schema.");
}

run().catch((e) => {
  console.error("✗ Falha no teste de schema:", e.message);
  process.exit(1);
});
