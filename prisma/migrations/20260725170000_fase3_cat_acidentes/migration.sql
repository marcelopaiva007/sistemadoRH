-- Fase 3 — Acidentes de trabalho / CAT.
--
-- Aditiva: só cria uma tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- A CAT precisa ser emitida ao INSS em até 1 dia útil (imediata se fatal); os
-- campos de emissão aqui são para o RH PROVAR que cumpriu o prazo, não para o
-- sistema emitir a CAT (isso continua no site do governo). `ausenciaId` liga
-- o acidente ao afastamento correspondente quando houve — a Ausencia com
-- tipo "ACIDENTE_TRABALHO" já existe desde a Fase 1.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."AcidenteTrabalho" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "local" TEXT,
    "descricao" TEXT NOT NULL,
    "parteCorpoAtingida" TEXT,
    "natureza" TEXT,
    "houveAfastamento" BOOLEAN NOT NULL DEFAULT false,
    "ausenciaId" TEXT,
    "catEmitida" BOOLEAN NOT NULL DEFAULT false,
    "catNumero" TEXT,
    "catEmitidaEm" TIMESTAMP(3),
    "testemunhas" TEXT,
    "medidasCorretivas" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'EM_INVESTIGACAO',
    "arquivoId" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcidenteTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AcidenteTrabalho_ausenciaId_key" ON "rh"."AcidenteTrabalho"("ausenciaId");
CREATE UNIQUE INDEX IF NOT EXISTS "AcidenteTrabalho_arquivoId_key" ON "rh"."AcidenteTrabalho"("arquivoId");
CREATE INDEX IF NOT EXISTS "AcidenteTrabalho_empresaId_dataHora_idx" ON "rh"."AcidenteTrabalho"("empresaId", "dataHora");
CREATE INDEX IF NOT EXISTS "AcidenteTrabalho_colaboradorId_dataHora_idx" ON "rh"."AcidenteTrabalho"("colaboradorId", "dataHora");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."AcidenteTrabalho" ADD CONSTRAINT "AcidenteTrabalho_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."AcidenteTrabalho" ADD CONSTRAINT "AcidenteTrabalho_ausenciaId_fkey"
    FOREIGN KEY ("ausenciaId") REFERENCES "rh"."Ausencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."AcidenteTrabalho" ADD CONSTRAINT "AcidenteTrabalho_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
