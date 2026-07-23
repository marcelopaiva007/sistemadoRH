-- Telefone de contato do colaborador (importado do elleven).
-- IF NOT EXISTS para ser idempotente caso a coluna já tenha sido criada à mão.
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "telefone" TEXT;
