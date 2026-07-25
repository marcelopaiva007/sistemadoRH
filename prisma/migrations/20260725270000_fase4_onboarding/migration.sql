-- Fase 4 — Onboarding: trilha de integração do novo colaborador.
--
-- Aditiva: só cria tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ChecklistIntegracao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavel" TEXT,
    "prazo" TIMESTAMP(3),
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPorId" TEXT,
    "concluidoPorNome" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistIntegracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChecklistIntegracao_colaboradorId_idx" ON "rh"."ChecklistIntegracao"("colaboradorId");
CREATE INDEX IF NOT EXISTS "ChecklistIntegracao_empresaId_concluido_idx" ON "rh"."ChecklistIntegracao"("empresaId", "concluido");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."ChecklistIntegracao" ADD CONSTRAINT "ChecklistIntegracao_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
