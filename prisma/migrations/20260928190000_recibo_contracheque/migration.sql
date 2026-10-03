-- Envio de contracheque com confirmação de recebimento por foto (v1.180.0).
-- O RH envia os contracheques de uma competência; o colaborador abre no
-- portal e confirma com uma selfie. Esta tabela guarda a prova: quando
-- abriu, quando confirmou, de onde, o hash do arquivo e a foto.
--
-- Só tabela nova — nada existente muda. Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."ReciboContracheque" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "tipoFolha" TEXT NOT NULL DEFAULT 'MENSAL',
    "enviadoEm" TIMESTAMP(3),
    "enviadoPorNome" TEXT,
    "canal" TEXT,
    "envioErro" TEXT,
    "envios" INTEGER NOT NULL DEFAULT 0,
    "vistoEm" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "confirmadoIp" TEXT,
    "confirmadoDispositivo" TEXT,
    "hashDocumento" TEXT,
    "fotoArquivoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReciboContracheque_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReciboContracheque_documentoId_key" ON "rh"."ReciboContracheque"("documentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReciboContracheque_fotoArquivoId_key" ON "rh"."ReciboContracheque"("fotoArquivoId");
CREATE INDEX IF NOT EXISTS "ReciboContracheque_empresaId_competencia_idx" ON "rh"."ReciboContracheque"("empresaId", "competencia");
CREATE INDEX IF NOT EXISTS "ReciboContracheque_colaboradorId_confirmadoEm_idx" ON "rh"."ReciboContracheque"("colaboradorId", "confirmadoEm");

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContracheque" ADD CONSTRAINT "ReciboContracheque_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContracheque" ADD CONSTRAINT "ReciboContracheque_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "rh"."DocumentoColaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContracheque" ADD CONSTRAINT "ReciboContracheque_fotoArquivoId_fkey" FOREIGN KEY ("fotoArquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
