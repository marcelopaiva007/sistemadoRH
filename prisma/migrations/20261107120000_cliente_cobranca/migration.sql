-- Cobrança e situação do cliente (v1.201.0, Gestão FASTMAI).
--
-- Pedido do CEO em 07/11/2026: a tela de Clientes vira a administração do
-- sistema — quanto cada cliente paga, quando vence e se está ativo.
--   1. valorMensalCentavos: valor do plano por mês, em centavos. Opcional.
--   2. diaVencimento: dia do mês (1 a 31). Opcional.
--   3. contratoAtivo: situação comercial. Todos os clientes de hoje nascem
--      ativos. Só informa — não mexe em login nem em acesso.
-- Idempotente como as demais.

ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "valorMensalCentavos" INTEGER;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "diaVencimento" INTEGER;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "contratoAtivo" BOOLEAN NOT NULL DEFAULT true;
