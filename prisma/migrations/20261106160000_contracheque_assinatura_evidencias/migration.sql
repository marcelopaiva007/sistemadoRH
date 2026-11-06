-- Assinatura eletrônica de contracheque por e-mail com evidências e 2FA (v1.197.0).
-- Adiciona token único de assinatura, campos de autenticação em dois fatores (2FA),
-- bloqueio de segurança após 5 erros, ciência no Telegram, régua de cobrança
-- e amarração do PDF assinado completo com a folha de evidências anexada.

ALTER TABLE "rh"."ReciboContracheque"
  ADD COLUMN IF NOT EXISTS "tokenAssinatura" TEXT,
  ADD COLUMN IF NOT EXISTS "codigo2faHash" TEXT,
  ADD COLUMN IF NOT EXISTS "codigoExpiraEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "canalCodigo" TEXT,
  ADD COLUMN IF NOT EXISTS "codigoValidadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tentativasCodigo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bloqueadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cienciaTelegramEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lembretesEnviados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ultimoLembreteEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmadoLocalizacao" TEXT,
  ADD COLUMN IF NOT EXISTS "textoAceite" TEXT,
  ADD COLUMN IF NOT EXISTS "comprovanteArquivoId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ReciboContracheque_tokenAssinatura_key" ON "rh"."ReciboContracheque"("tokenAssinatura");
CREATE UNIQUE INDEX IF NOT EXISTS "ReciboContracheque_comprovanteArquivoId_key" ON "rh"."ReciboContracheque"("comprovanteArquivoId");
CREATE INDEX IF NOT EXISTS "ReciboContracheque_tokenAssinatura_idx" ON "rh"."ReciboContracheque"("tokenAssinatura");

DO $$ BEGIN
  ALTER TABLE "rh"."ReciboContracheque"
    ADD CONSTRAINT "ReciboContracheque_comprovanteArquivoId_fkey"
    FOREIGN KEY ("comprovanteArquivoId") REFERENCES "rh"."Arquivo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
