-- Ajuste das Regras de Bonificação conforme a OS (política de comissionamento).

-- LancamentoVenda: valor dos serviços não-internet (base dos 50% do ADM) e contagem de TV.
ALTER TABLE "LancamentoVenda" ADD COLUMN "valorDemaisServicos" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LancamentoVenda" ADD COLUMN "qtdTv" INTEGER NOT NULL DEFAULT 0;

-- RegraBonificacao: substitui os campos "flat" por uma única config JSON.
ALTER TABLE "RegraBonificacao" ADD COLUMN "config" JSONB;
ALTER TABLE "RegraBonificacao" DROP COLUMN "metaQtd";
ALTER TABLE "RegraBonificacao" DROP COLUMN "valorMeta";
ALTER TABLE "RegraBonificacao" DROP COLUMN "superMetaQtd";
ALTER TABLE "RegraBonificacao" DROP COLUMN "valorSuperMeta";
ALTER TABLE "RegraBonificacao" DROP COLUMN "percentualTaxaAtivacao";
ALTER TABLE "RegraBonificacao" DROP COLUMN "valoresPorProduto";
ALTER TABLE "RegraBonificacao" DROP COLUMN "regraSupervisor";

-- BonificacaoCalculada: breakdown por serviço (internet/chip/demais) em vez de base/meta/super-meta/produtos.
ALTER TABLE "BonificacaoCalculada" DROP COLUMN "valorBase";
ALTER TABLE "BonificacaoCalculada" DROP COLUMN "valorMeta";
ALTER TABLE "BonificacaoCalculada" DROP COLUMN "valorSuperMeta";
ALTER TABLE "BonificacaoCalculada" DROP COLUMN "valorProdutos";
ALTER TABLE "BonificacaoCalculada" ADD COLUMN "valorInternet" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BonificacaoCalculada" ADD COLUMN "valorChip" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BonificacaoCalculada" ADD COLUMN "valorDemais" DOUBLE PRECISION NOT NULL DEFAULT 0;
