-- Fase 2 — Movimentações e organograma.
--
-- Aditiva: só cria coluna/tabela novas no schema `rh`. Roda com o app no ar.
-- Escrita com IF NOT EXISTS / guardas de constraint para poder ser reaplicada
-- (o SQL deste projeto é aplicado à mão — ver README).
--
--   Colaborador.supervisorId -> a quem reporta hoje (auto-relacionamento). É a
--                                FOTO atual, base do organograma.
--   Movimentacao              -> o FILME: cada troca de setor, cargo ou líder,
--                                com o antes e o depois. Aplicar uma
--                                movimentação atualiza o Colaborador na mesma
--                                transação — histórico e estado atual nascem
--                                juntos, nunca divergem.

-- AlterTable
ALTER TABLE "rh"."Colaborador"
  ADD COLUMN IF NOT EXISTS "supervisorId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Movimentacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataEfetiva" TIMESTAMP(3) NOT NULL,
    "setorAnteriorNome" TEXT,
    "setorNovoId" TEXT,
    "setorNovoNome" TEXT,
    "posicaoAnteriorNome" TEXT,
    "posicaoNovaId" TEXT,
    "posicaoNovaNome" TEXT,
    "supervisorAnteriorNome" TEXT,
    "supervisorNovoId" TEXT,
    "supervisorNovoNome" TEXT,
    "motivo" TEXT,
    "observacoes" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Movimentacao_empresaId_dataEfetiva_idx" ON "rh"."Movimentacao"("empresaId", "dataEfetiva");
CREATE INDEX IF NOT EXISTS "Movimentacao_colaboradorId_dataEfetiva_idx" ON "rh"."Movimentacao"("colaboradorId", "dataEfetiva");
CREATE INDEX IF NOT EXISTS "Colaborador_supervisorId_idx" ON "rh"."Colaborador"("supervisorId");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."Colaborador" ADD CONSTRAINT "Colaborador_supervisorId_fkey"
    FOREIGN KEY ("supervisorId") REFERENCES "rh"."Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Movimentacao" ADD CONSTRAINT "Movimentacao_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
