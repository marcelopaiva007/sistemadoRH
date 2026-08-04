-- CreateTable
CREATE TABLE "rh"."ConfiguracaoLembrete" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "ConfiguracaoLembrete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracaoLembrete_chave_idx" ON "rh"."ConfiguracaoLembrete"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoLembrete_chave_horario_key" ON "rh"."ConfiguracaoLembrete"("chave", "horario");
