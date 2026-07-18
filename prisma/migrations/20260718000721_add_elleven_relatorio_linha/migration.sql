-- CreateTable
CREATE TABLE "elleven_relatorio_linha" (
    "id" SERIAL NOT NULL,
    "relatorio" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elleven_relatorio_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "elleven_relatorio_linha_relatorio_periodo_idx" ON "elleven_relatorio_linha"("relatorio", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "elleven_relatorio_linha_relatorio_periodo_chave_key" ON "elleven_relatorio_linha"("relatorio", "periodo", "chave");
