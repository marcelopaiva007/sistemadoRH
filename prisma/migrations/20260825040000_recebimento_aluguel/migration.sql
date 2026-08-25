-- Recebimento de aluguéis (25/08/2026) — imóveis do grupo alugados a terceiros.
--
-- PURAMENTE ADITIVA: uma tabela nova (RecebimentoAluguel), nenhum ALTER em
-- tabela existente, nenhum dado tocado. Sobe sozinha, sem tela — mesmo motivo
-- das anteriores: `prisma/checar-migracoes.mjs` derruba o Preview de qualquer
-- branch com migration pendente, então tabela e tela vão em PRs separadas.
--
-- O contrato do imóvel já é representável hoje (Contrato com categoria
-- RECEITA); o que faltava é a régua de parcelas mensais, uma por competência.

-- CreateTable
CREATE TABLE "rh"."RecebimentoAluguel" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valorPrevisto" DOUBLE PRECISION NOT NULL,
    "recebidoEm" TIMESTAMP(3),
    "valorRecebido" DOUBLE PRECISION,
    "observacoes" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecebimentoAluguel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecebimentoAluguel_contratoId_competencia_key" ON "rh"."RecebimentoAluguel"("contratoId", "competencia");

-- CreateIndex
CREATE INDEX "RecebimentoAluguel_empresaId_vencimento_idx" ON "rh"."RecebimentoAluguel"("empresaId", "vencimento");

-- CreateIndex
CREATE INDEX "RecebimentoAluguel_empresaId_recebidoEm_idx" ON "rh"."RecebimentoAluguel"("empresaId", "recebidoEm");

-- AddForeignKey
ALTER TABLE "rh"."RecebimentoAluguel" ADD CONSTRAINT "RecebimentoAluguel_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "rh"."Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
