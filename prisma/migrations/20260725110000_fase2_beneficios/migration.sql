-- Fase 2 — Benefícios (VT, VR/VA, plano de saúde, ...).
--
-- Aditiva: só cria uma tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- "Ativo" não é coluna: benefício vigente é dataFim IS NULL ou no futuro.
-- Encerrar é preencher dataFim — nunca apagar a linha, para o custo histórico
-- continuar reconstituível.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."BeneficioColaborador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "operadora" TEXT,
    "plano" TEXT,
    "valorEmpresa" DOUBLE PRECISION,
    "valorColaborador" DOUBLE PRECISION,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficioColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BeneficioColaborador_empresaId_tipo_idx" ON "rh"."BeneficioColaborador"("empresaId", "tipo");
CREATE INDEX IF NOT EXISTS "BeneficioColaborador_colaboradorId_dataFim_idx" ON "rh"."BeneficioColaborador"("colaboradorId", "dataFim");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."BeneficioColaborador" ADD CONSTRAINT "BeneficioColaborador_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
