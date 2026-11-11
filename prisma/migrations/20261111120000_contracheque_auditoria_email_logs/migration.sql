-- Auditoria de contracheque invalidado e metadados de logs SMTP (v1.203.0).
-- 1. Cria rh.ReciboContrachequeInvalidado como snapshot forense imutável de
--    assinaturas contestadas/invalidadas, preservando fotos, comprovantes e carimbos.
-- 2. Adiciona colunas de rastreamento (origem, empresaId, marcaNome, status) e
--    índices de consulta operacional em rh.EmailEnviado.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ReciboContrachequeInvalidado" (
    "id" TEXT NOT NULL,
    "reciboId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "invalidadoPorId" TEXT NOT NULL,
    "invalidadoPorNome" TEXT NOT NULL,
    "invalidadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canalOriginal" TEXT,
    "enviadoEmOriginal" TIMESTAMP(3),
    "cienciaTelegramEm" TIMESTAMP(3),
    "vistoEmOriginal" TIMESTAMP(3),
    "codigoValidadoEm" TIMESTAMP(3),
    "canalCodigo" TEXT,
    "confirmadoEmOriginal" TIMESTAMP(3) NOT NULL,
    "confirmadoIp" TEXT,
    "confirmadoDispositivo" TEXT,
    "confirmadoLocalizacao" TEXT,
    "hashDocumento" TEXT,
    "textoAceite" TEXT,
    "fotoArquivoId" TEXT,
    "comprovanteArquivoId" TEXT,

    CONSTRAINT "ReciboContrachequeInvalidado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReciboContrachequeInvalidado_reciboId_invalidadoEm_idx" ON "rh"."ReciboContrachequeInvalidado"("reciboId", "invalidadoEm");
CREATE INDEX IF NOT EXISTS "ReciboContrachequeInvalidado_documentoId_invalidadoEm_idx" ON "rh"."ReciboContrachequeInvalidado"("documentoId", "invalidadoEm");
CREATE INDEX IF NOT EXISTS "ReciboContrachequeInvalidado_colaboradorId_invalidadoEm_idx" ON "rh"."ReciboContrachequeInvalidado"("colaboradorId", "invalidadoEm");
CREATE INDEX IF NOT EXISTS "ReciboContrachequeInvalidado_empresaId_invalidadoEm_idx" ON "rh"."ReciboContrachequeInvalidado"("empresaId", "invalidadoEm");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_reciboId_fkey"
    FOREIGN KEY ("reciboId") REFERENCES "rh"."ReciboContracheque"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "rh"."DocumentoColaborador"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_fotoArquivoId_fkey"
    FOREIGN KEY ("fotoArquivoId") REFERENCES "rh"."Arquivo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContrachequeInvalidado"
    ADD CONSTRAINT "ReciboContrachequeInvalidado_comprovanteArquivoId_fkey"
    FOREIGN KEY ("comprovanteArquivoId") REFERENCES "rh"."Arquivo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: EmailEnviado
ALTER TABLE "rh"."EmailEnviado"
  ADD COLUMN IF NOT EXISTS "origem" TEXT,
  ADD COLUMN IF NOT EXISTS "empresaId" TEXT,
  ADD COLUMN IF NOT EXISTS "marcaNome" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ENVIADO';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailEnviado_status_enviadoEm_idx" ON "rh"."EmailEnviado"("status", "enviadoEm");
CREATE INDEX IF NOT EXISTS "EmailEnviado_origem_enviadoEm_idx" ON "rh"."EmailEnviado"("origem", "enviadoEm");
CREATE INDEX IF NOT EXISTS "EmailEnviado_empresaId_enviadoEm_idx" ON "rh"."EmailEnviado"("empresaId", "enviadoEm");
