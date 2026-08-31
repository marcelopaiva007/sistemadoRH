-- Valor de referência da tabela FIPE do veículo, em reais — informado à mão
-- pelo RH (pedido de 31/08/2026). Alimenta o relatório da frota.
ALTER TABLE "rh"."Veiculo" ADD COLUMN "valorFipe" DOUBLE PRECISION;
