-- Fase 5 — Eventos variáveis da folha: competência mensal + lançamentos.
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."CompetenciaFolha" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "referencia" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "fechadaEm" TIMESTAMP(3),
    "fechadaPorId" TEXT,
    "fechadaPorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetenciaFolha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."EventoFolha" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competenciaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION,
    "valor" DOUBLE PRECISION,
    "observacoes" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoFolha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetenciaFolha_empresaId_status_idx" ON "rh"."CompetenciaFolha"("empresaId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetenciaFolha_empresaId_referencia_key" ON "rh"."CompetenciaFolha"("empresaId", "referencia");
CREATE INDEX IF NOT EXISTS "EventoFolha_competenciaId_colaboradorId_idx" ON "rh"."EventoFolha"("competenciaId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "EventoFolha_empresaId_tipo_idx" ON "rh"."EventoFolha"("empresaId", "tipo");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."EventoFolha" ADD CONSTRAINT "EventoFolha_competenciaId_fkey"
    FOREIGN KEY ("competenciaId") REFERENCES "rh"."CompetenciaFolha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."EventoFolha" ADD CONSTRAINT "EventoFolha_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
