-- Fase 3 — Offboarding formal (checklist de saída + entrevista de desligamento).
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- O motivo do desligamento já mora em Colaborador (Fase 1); aqui só o que
-- falta: devolução de ativos + passos de saída (checklist) e a entrevista.
-- Devolução de ativo é só mais um item do checklist, sem modelo próprio.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ChecklistDesligamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "descricao" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPorId" TEXT,
    "concluidoPorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistDesligamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."EntrevistaDesligamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "dataEntrevista" TIMESTAMP(3) NOT NULL,
    "motivoReal" TEXT,
    "recomendariaEmpresa" BOOLEAN,
    "satisfacaoGeral" INTEGER,
    "pontosPositivos" TEXT,
    "pontosMelhoria" TEXT,
    "observacoes" TEXT,
    "entrevistadoPorId" TEXT,
    "entrevistadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntrevistaDesligamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChecklistDesligamento_colaboradorId_idx" ON "rh"."ChecklistDesligamento"("colaboradorId");
CREATE INDEX IF NOT EXISTS "ChecklistDesligamento_empresaId_concluido_idx" ON "rh"."ChecklistDesligamento"("empresaId", "concluido");
CREATE UNIQUE INDEX IF NOT EXISTS "EntrevistaDesligamento_colaboradorId_key" ON "rh"."EntrevistaDesligamento"("colaboradorId");
CREATE INDEX IF NOT EXISTS "EntrevistaDesligamento_empresaId_dataEntrevista_idx" ON "rh"."EntrevistaDesligamento"("empresaId", "dataEntrevista");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."ChecklistDesligamento" ADD CONSTRAINT "ChecklistDesligamento_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."EntrevistaDesligamento" ADD CONSTRAINT "EntrevistaDesligamento_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
