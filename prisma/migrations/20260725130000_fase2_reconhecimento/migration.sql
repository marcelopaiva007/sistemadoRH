-- Fase 2 — Reconhecimento (aniversário e tempo de casa).
--
-- Aditiva: só cria uma tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- Reconhecimento registra cada parabéns enviado pelo bot do Telegram. A unique
-- de (colaborador, tipo, ano) evita mandar "feliz aniversário" duas vezes no
-- mesmo ano — inclusive protege contra duplo clique, sem precisar de trava em
-- memória: a segunda tentativa esbarra na constraint.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Reconhecimento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "anosCompletos" INTEGER,
    "canal" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "enviadoPorId" TEXT,
    "enviadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reconhecimento_empresaId_createdAt_idx" ON "rh"."Reconhecimento"("empresaId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Reconhecimento_colaboradorId_tipo_ano_key" ON "rh"."Reconhecimento"("colaboradorId", "tipo", "ano");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."Reconhecimento" ADD CONSTRAINT "Reconhecimento_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
