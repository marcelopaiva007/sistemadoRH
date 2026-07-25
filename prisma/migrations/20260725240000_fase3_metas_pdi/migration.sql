-- Fase 3 — Metas & PDI (metas por pessoa/setor, plano de desenvolvimento individual).
--
-- Aditiva: só cria tabelas novas no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Meta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "setorId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."PlanoDesenvolvimento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazo" TIMESTAMP(3),
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPorId" TEXT,
    "concluidoPorNome" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoDesenvolvimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Meta_empresaId_colaboradorId_idx" ON "rh"."Meta"("empresaId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "Meta_empresaId_setorId_idx" ON "rh"."Meta"("empresaId", "setorId");
CREATE INDEX IF NOT EXISTS "Meta_empresaId_status_idx" ON "rh"."Meta"("empresaId", "status");
CREATE INDEX IF NOT EXISTS "PlanoDesenvolvimento_empresaId_colaboradorId_idx" ON "rh"."PlanoDesenvolvimento"("empresaId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "PlanoDesenvolvimento_empresaId_concluido_idx" ON "rh"."PlanoDesenvolvimento"("empresaId", "concluido");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."Meta" ADD CONSTRAINT "Meta_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Meta" ADD CONSTRAINT "Meta_setorId_fkey"
    FOREIGN KEY ("setorId") REFERENCES "rh"."Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."PlanoDesenvolvimento" ADD CONSTRAINT "PlanoDesenvolvimento_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Meta é individual OU de setor, nunca as duas nem nenhuma — garantido no
-- banco, não só na action, porque é uma regra que não pode quebrar mesmo se
-- alguém escrever direto via SQL/Prisma Studio.
DO $$
BEGIN
  ALTER TABLE "rh"."Meta" ADD CONSTRAINT "Meta_colaborador_xor_setor_check"
    CHECK (("colaboradorId" IS NOT NULL) != ("setorId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
