-- Proprietário do veículo (v1.183.0): quem consta no CRLV — CPF ou CNPJ —,
-- separado da empresa onde o veículo TRABALHA (Veiculo.empresaId).
--
-- Só colunas novas e opcionais — nada existente muda. Idempotente como as demais.

ALTER TABLE "rh"."Veiculo" ADD COLUMN IF NOT EXISTS "proprietarioTipo" TEXT;
ALTER TABLE "rh"."Veiculo" ADD COLUMN IF NOT EXISTS "proprietarioNome" TEXT;
ALTER TABLE "rh"."Veiculo" ADD COLUMN IF NOT EXISTS "proprietarioDocumento" TEXT;

CREATE INDEX IF NOT EXISTS "Veiculo_proprietarioDocumento_idx" ON "rh"."Veiculo"("proprietarioDocumento");
