-- Fase 3 — Treinamentos & trilhas (não-NR): capacitações, presença, certificados.
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Treinamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "cargaHoraria" INTEGER,
    "competencias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Treinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ParticipacaoTreinamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "treinamentoId" TEXT NOT NULL,
    "dataRealizacao" TIMESTAMP(3) NOT NULL,
    "presente" BOOLEAN NOT NULL DEFAULT true,
    "notaAvaliacao" INTEGER,
    "certificadoEmitido" BOOLEAN NOT NULL DEFAULT false,
    "arquivoId" TEXT,
    "observacoes" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipacaoTreinamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Treinamento_empresaId_ativo_idx" ON "rh"."Treinamento"("empresaId", "ativo");
CREATE UNIQUE INDEX IF NOT EXISTS "Treinamento_empresaId_nome_key" ON "rh"."Treinamento"("empresaId", "nome");
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipacaoTreinamento_arquivoId_key" ON "rh"."ParticipacaoTreinamento"("arquivoId");
CREATE INDEX IF NOT EXISTS "ParticipacaoTreinamento_empresaId_colaboradorId_idx" ON "rh"."ParticipacaoTreinamento"("empresaId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "ParticipacaoTreinamento_empresaId_treinamentoId_idx" ON "rh"."ParticipacaoTreinamento"("empresaId", "treinamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ParticipacaoTreinamento_colaboradorId_treinamentoId_dataRea_key" ON "rh"."ParticipacaoTreinamento"("colaboradorId", "treinamentoId", "dataRealizacao");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."ParticipacaoTreinamento" ADD CONSTRAINT "ParticipacaoTreinamento_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."ParticipacaoTreinamento" ADD CONSTRAINT "ParticipacaoTreinamento_treinamentoId_fkey"
    FOREIGN KEY ("treinamentoId") REFERENCES "rh"."Treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."ParticipacaoTreinamento" ADD CONSTRAINT "ParticipacaoTreinamento_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
