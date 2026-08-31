-- Módulo Financeiro da Frota (spec de 31/08/2026): situação de pagamento de
-- cada veículo (1:1), com recorrência e override manual do próximo vencimento.
CREATE TABLE "rh"."VeiculoFinanceiro" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipoAquisicao" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "credor" TEXT,
    "contratoNumero" TEXT,
    "valorTotal" DOUBLE PRECISION,
    "valorParcela" DOUBLE PRECISION,
    "qtdParcelasTotal" INTEGER,
    "qtdParcelasPagas" INTEGER NOT NULL DEFAULT 0,
    "dataPrimeiraParcela" TIMESTAMP(3),
    "recorrencia" TEXT NOT NULL DEFAULT 'MENSAL',
    "recorrenciaIntervaloDias" INTEGER,
    "dataProximoVencimento" TIMESTAMP(3),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VeiculoFinanceiro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VeiculoFinanceiro_veiculoId_key" ON "rh"."VeiculoFinanceiro"("veiculoId");

CREATE INDEX "VeiculoFinanceiro_empresaId_dataProximoVencimento_idx" ON "rh"."VeiculoFinanceiro"("empresaId", "dataProximoVencimento");

ALTER TABLE "rh"."VeiculoFinanceiro" ADD CONSTRAINT "VeiculoFinanceiro_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
