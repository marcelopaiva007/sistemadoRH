-- CreateTable
CREATE TABLE "ContratoAtivacaoElleven" (
    "id" TEXT NOT NULL,
    "numeroContrato" TEXT,
    "cpf" TEXT,
    "nome" TEXT,
    "produto" TEXT,
    "dataAtivacao" TIMESTAMP(3),
    "status" TEXT,
    "rawJson" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoAtivacaoElleven_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContratoAtivacaoElleven_numeroContrato_key" ON "ContratoAtivacaoElleven"("numeroContrato");

-- CreateIndex
CREATE INDEX "ContratoAtivacaoElleven_cpf_idx" ON "ContratoAtivacaoElleven"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "ContratoAtivacaoElleven_cpf_dataAtivacao_key" ON "ContratoAtivacaoElleven"("cpf", "dataAtivacao");
