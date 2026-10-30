-- Informativos do RH (v1.181.0): comunicado do RH para uma pessoa, um setor,
-- um CNPJ ou a marca inteira, com ciência ("li e estou ciente") por pessoa.
--
-- Só tabelas novas — nada existente muda. Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."Informativo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "publico" TEXT NOT NULL,
    "enviadoPorId" TEXT,
    "enviadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Informativo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rh"."InformativoDestinatario" (
    "id" TEXT NOT NULL,
    "informativoId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "canal" TEXT,
    "envioErro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "cienteEm" TIMESTAMP(3),
    "cientePor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformativoDestinatario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Informativo_empresaId_createdAt_idx" ON "rh"."Informativo"("empresaId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "InformativoDestinatario_informativoId_colaboradorId_key" ON "rh"."InformativoDestinatario"("informativoId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "InformativoDestinatario_colaboradorId_cienteEm_idx" ON "rh"."InformativoDestinatario"("colaboradorId", "cienteEm");
CREATE INDEX IF NOT EXISTS "InformativoDestinatario_empresaId_idx" ON "rh"."InformativoDestinatario"("empresaId");

DO $$ BEGIN
  ALTER TABLE "rh"."InformativoDestinatario" ADD CONSTRAINT "InformativoDestinatario_informativoId_fkey" FOREIGN KEY ("informativoId") REFERENCES "rh"."Informativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rh"."InformativoDestinatario" ADD CONSTRAINT "InformativoDestinatario_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
