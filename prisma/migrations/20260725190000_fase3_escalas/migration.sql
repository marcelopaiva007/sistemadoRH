-- Fase 3 — Escalas de turno para o campo.
--
-- Aditiva: só cria uma tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- Uma linha por (colaborador, dia) — reatribuir o turno de alguém num dia é
-- UPDATE, não um novo registro empilhado (dá pra fazer upsert direto por essa
-- chave). Sem cálculo de hora extra ou banco de horas de propósito: é só
-- "quem está de plantão em cada dia", o que a operação de campo pediu agora.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."EscalaTurno" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "turno" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EscalaTurno_empresaId_data_idx" ON "rh"."EscalaTurno"("empresaId", "data");
CREATE UNIQUE INDEX IF NOT EXISTS "EscalaTurno_colaboradorId_data_key" ON "rh"."EscalaTurno"("colaboradorId", "data");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."EscalaTurno" ADD CONSTRAINT "EscalaTurno_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
