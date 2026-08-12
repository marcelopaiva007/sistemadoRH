-- CreateTable "ConfiguracaoPonto"
CREATE TABLE "rh"."ConfiguracaoPonto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "minutosAntecipacao" INTEGER NOT NULL DEFAULT 60,
    "minutosTolerancia" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPonto_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Ponto"
CREATE TABLE "rh"."Ponto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "selfieBase64" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "localizacao" TEXT,
    "observacao" TEXT,
    "dentro_janela" BOOLEAN NOT NULL DEFAULT true,
    "turnoEsperado" TEXT,
    "horarioEsperadoInicio" TIMESTAMP(3),
    "horarioEsperadoFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ponto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoPonto_empresaId_key" ON "rh"."ConfiguracaoPonto"("empresaId");

-- CreateIndex
CREATE INDEX "ConfiguracaoPonto_empresaId_idx" ON "rh"."ConfiguracaoPonto"("empresaId");

-- CreateIndex
CREATE INDEX "Ponto_empresaId_colaboradorId_idx" ON "rh"."Ponto"("empresaId", "colaboradorId");

-- CreateIndex
CREATE INDEX "Ponto_empresaId_dataHora_idx" ON "rh"."Ponto"("empresaId", "dataHora");

-- CreateIndex
CREATE INDEX "Ponto_colaboradorId_dataHora_idx" ON "rh"."Ponto"("colaboradorId", "dataHora");

-- AddForeignKey
ALTER TABLE "rh"."Ponto" ADD CONSTRAINT "Ponto_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
