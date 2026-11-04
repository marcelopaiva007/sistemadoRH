-- Transferência entre CNPJs do grupo (v1.184.0): o CNPJ de destino de quem saiu
-- de uma ficha por TRANSFERENCIA_GRUPO (motivoDesligamento). A data é a própria
-- dataDesligamento.
--
-- Só coluna nova e opcional — nada existente muda. Idempotente como as demais.

ALTER TABLE "rh"."Colaborador" ADD COLUMN IF NOT EXISTS "transferidoParaEmpresaId" TEXT;
