-- CreateTable
CREATE TABLE "rh"."Atualizacao" (
    "id" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dataSaida" TIMESTAMP(3) NOT NULL,
    "autor" TEXT,
    "commit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atualizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Atualizacao_versao_key" ON "rh"."Atualizacao"("versao");

-- CreateIndex
CREATE INDEX "Atualizacao_dataSaida_idx" ON "rh"."Atualizacao"("dataSaida");
