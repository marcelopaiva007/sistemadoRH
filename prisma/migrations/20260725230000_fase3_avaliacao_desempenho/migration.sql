-- Fase 3 — Avaliação de desempenho (ciclos 90/180/360°, competências, nine-box).
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."CicloAvaliacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "encerrado" BOOLEAN NOT NULL DEFAULT false,
    "encerradoEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CicloAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."AvaliacaoDesempenho" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "cicloId" TEXT NOT NULL,
    "tipoAvaliador" TEXT NOT NULL,
    "avaliadorId" TEXT NOT NULL,
    "avaliadorNome" TEXT,
    "notaFinal" DOUBLE PRECISION,
    "potencial" TEXT,
    "pontosFortes" TEXT,
    "pontosDesenvolvimento" TEXT,
    "comentarios" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvaliacaoDesempenho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."NotaCompetencia" (
    "id" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,

    CONSTRAINT "NotaCompetencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CicloAvaliacao_empresaId_encerrado_idx" ON "rh"."CicloAvaliacao"("empresaId", "encerrado");
CREATE INDEX IF NOT EXISTS "AvaliacaoDesempenho_empresaId_cicloId_idx" ON "rh"."AvaliacaoDesempenho"("empresaId", "cicloId");
CREATE INDEX IF NOT EXISTS "AvaliacaoDesempenho_colaboradorId_idx" ON "rh"."AvaliacaoDesempenho"("colaboradorId");
CREATE UNIQUE INDEX IF NOT EXISTS "AvaliacaoDesempenho_colaboradorId_cicloId_avaliadorId_key" ON "rh"."AvaliacaoDesempenho"("colaboradorId", "cicloId", "avaliadorId");
CREATE UNIQUE INDEX IF NOT EXISTS "NotaCompetencia_avaliacaoId_competencia_key" ON "rh"."NotaCompetencia"("avaliacaoId", "competencia");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."AvaliacaoDesempenho" ADD CONSTRAINT "AvaliacaoDesempenho_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."AvaliacaoDesempenho" ADD CONSTRAINT "AvaliacaoDesempenho_cicloId_fkey"
    FOREIGN KEY ("cicloId") REFERENCES "rh"."CicloAvaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."NotaCompetencia" ADD CONSTRAINT "NotaCompetencia_avaliacaoId_fkey"
    FOREIGN KEY ("avaliacaoId") REFERENCES "rh"."AvaliacaoDesempenho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
