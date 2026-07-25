-- Fase 2 — Saúde, segurança e conformidade (matriz de NRs + exames ocupacionais).
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar. Escrita
-- com IF NOT EXISTS / guardas de constraint para poder ser reaplicada (o SQL
-- deste projeto é aplicado à mão — ver README).
--
--   RequisitoNR      -> o que a FUNÇÃO exige (NR-10, NR-35, ...) e de quanto em
--                       quanto tempo a reciclagem vence
--   CertificadoNR    -> a evidência de que UMA PESSOA cumpriu o requisito
--   ExameOcupacional -> o ASO do PCMSO (admissional, periódico, demissional...)
--
-- "Quem está irregular" NÃO vira coluna: é derivado do cruzamento requisito x
-- evidência em lib/conformidade.ts, para não existir status que alguém precise
-- manter atualizado à mão.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."RequisitoNR" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "posicaoId" TEXT NOT NULL,
    "norma" TEXT NOT NULL,
    "validadeMeses" INTEGER,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitoNR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."CertificadoNR" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "norma" TEXT NOT NULL,
    "realizadoEm" TIMESTAMP(3) NOT NULL,
    "validoAte" TIMESTAMP(3),
    "cargaHoraria" INTEGER,
    "instrutor" TEXT,
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoNR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ExameOcupacional" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "realizadoEm" TIMESTAMP(3) NOT NULL,
    "validoAte" TIMESTAMP(3),
    "resultado" TEXT NOT NULL,
    "restricoes" TEXT,
    "medico" TEXT,
    "crm" TEXT,
    "clinica" TEXT,
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExameOcupacional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RequisitoNR_empresaId_idx" ON "rh"."RequisitoNR"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequisitoNR_posicaoId_norma_key" ON "rh"."RequisitoNR"("posicaoId", "norma");
CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoNR_arquivoId_key" ON "rh"."CertificadoNR"("arquivoId");
CREATE INDEX IF NOT EXISTS "CertificadoNR_colaboradorId_norma_idx" ON "rh"."CertificadoNR"("colaboradorId", "norma");
CREATE INDEX IF NOT EXISTS "CertificadoNR_empresaId_validoAte_idx" ON "rh"."CertificadoNR"("empresaId", "validoAte");
CREATE UNIQUE INDEX IF NOT EXISTS "ExameOcupacional_arquivoId_key" ON "rh"."ExameOcupacional"("arquivoId");
CREATE INDEX IF NOT EXISTS "ExameOcupacional_colaboradorId_realizadoEm_idx" ON "rh"."ExameOcupacional"("colaboradorId", "realizadoEm");
CREATE INDEX IF NOT EXISTS "ExameOcupacional_empresaId_validoAte_idx" ON "rh"."ExameOcupacional"("empresaId", "validoAte");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."RequisitoNR" ADD CONSTRAINT "RequisitoNR_posicaoId_fkey"
    FOREIGN KEY ("posicaoId") REFERENCES "rh"."Posicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."CertificadoNR" ADD CONSTRAINT "CertificadoNR_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."CertificadoNR" ADD CONSTRAINT "CertificadoNR_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."ExameOcupacional" ADD CONSTRAINT "ExameOcupacional_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."ExameOcupacional" ADD CONSTRAINT "ExameOcupacional_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
