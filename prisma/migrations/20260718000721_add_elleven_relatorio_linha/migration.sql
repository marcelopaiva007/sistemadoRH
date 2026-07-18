-- CreateTable
CREATE TABLE IF NOT EXISTS "elleven_relatorio_linha" (
    "id" SERIAL NOT NULL,
    "relatorio" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elleven_relatorio_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_idx" ON "elleven_relatorio_linha"("relatorio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_chave_key" ON "elleven_relatorio_linha"("relatorio", "periodo", "chave");
