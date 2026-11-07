-- Cadastro do cliente (v1.197.0, Fase 1 da Gestão FASTMAI): o Grupo, que a
-- Gestão chama de "cliente", ganha documento, responsável e dados de contrato.
-- Só ACRESCENTA colunas, todas opcionais: nada muda para quem já usa, e o
-- código antigo continua funcionando com o banco novo durante o deploy.
-- Idempotente como as demais.
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "responsavelNome" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "contatoEmail" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "contatoTelefone" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "plano" TEXT;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "limiteUsuarios" INTEGER;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "inicioContrato" DATE;
ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;
