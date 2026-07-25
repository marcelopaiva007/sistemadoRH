-- Fase 4 — Recrutamento & seleção (ATS): vagas, candidatos e funil.
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Vaga" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "setorId" TEXT,
    "posicaoId" TEXT,
    "descricao" TEXT,
    "requisitos" TEXT,
    "tipoContrato" TEXT,
    "faixaSalarial" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "slug" TEXT NOT NULL,
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Candidato" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "linkedin" TEXT,
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'RH',
    "consentimentoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Candidatura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL DEFAULT 'TRIAGEM',
    "motivo" TEXT,
    "observacoes" TEXT,
    "colaboradorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."EventoCandidatura" (
    "id" TEXT NOT NULL,
    "candidaturaId" TEXT NOT NULL,
    "etapaAnterior" TEXT,
    "etapaNova" TEXT NOT NULL,
    "motivo" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoCandidatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Vaga_slug_key" ON "rh"."Vaga"("slug");
CREATE INDEX IF NOT EXISTS "Vaga_empresaId_status_idx" ON "rh"."Vaga"("empresaId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Candidato_arquivoId_key" ON "rh"."Candidato"("arquivoId");
CREATE INDEX IF NOT EXISTS "Candidato_empresaId_nome_idx" ON "rh"."Candidato"("empresaId", "nome");
CREATE UNIQUE INDEX IF NOT EXISTS "Candidato_empresaId_cpf_key" ON "rh"."Candidato"("empresaId", "cpf");
CREATE INDEX IF NOT EXISTS "Candidatura_empresaId_etapa_idx" ON "rh"."Candidatura"("empresaId", "etapa");
CREATE INDEX IF NOT EXISTS "Candidatura_candidatoId_idx" ON "rh"."Candidatura"("candidatoId");
CREATE UNIQUE INDEX IF NOT EXISTS "Candidatura_vagaId_candidatoId_key" ON "rh"."Candidatura"("vagaId", "candidatoId");
CREATE INDEX IF NOT EXISTS "EventoCandidatura_candidaturaId_createdAt_idx" ON "rh"."EventoCandidatura"("candidaturaId", "createdAt");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."Vaga" ADD CONSTRAINT "Vaga_setorId_fkey"
    FOREIGN KEY ("setorId") REFERENCES "rh"."Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Vaga" ADD CONSTRAINT "Vaga_posicaoId_fkey"
    FOREIGN KEY ("posicaoId") REFERENCES "rh"."Posicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Candidato" ADD CONSTRAINT "Candidato_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Candidatura" ADD CONSTRAINT "Candidatura_vagaId_fkey"
    FOREIGN KEY ("vagaId") REFERENCES "rh"."Vaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Candidatura" ADD CONSTRAINT "Candidatura_candidatoId_fkey"
    FOREIGN KEY ("candidatoId") REFERENCES "rh"."Candidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."EventoCandidatura" ADD CONSTRAINT "EventoCandidatura_candidaturaId_fkey"
    FOREIGN KEY ("candidaturaId") REFERENCES "rh"."Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
