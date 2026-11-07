-- Login pelo endereço do cliente (v1.198.0, Fase 1 da Gestão FASTMAI).
--
-- 1. Grupo.dominio: o endereço próprio do cliente ("rh.cliente.com.br").
--    Opcional; nenhum cliente de hoje ganha um — o comportamento atual não
--    muda até a FASTMAI cadastrar o primeiro endereço.
-- 2. O login (username) deixa de ser único no SISTEMA e passa a ser único
--    POR CLIENTE: índice (grupoId, username). Conta sem cliente (MASTER e
--    legado) continua única entre si pelo índice parcial abaixo.
--    Os dados de hoje já são únicos no sistema inteiro, então os índices
--    novos nascem sem conflito. O índice antigo só sai DEPOIS dos novos.
-- Idempotente como as demais.

ALTER TABLE "rh"."Grupo" ADD COLUMN IF NOT EXISTS "dominio" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Grupo_dominio_key" ON "rh"."Grupo"("dominio");

CREATE UNIQUE INDEX IF NOT EXISTS "User_grupoId_username_key" ON "rh"."User"("grupoId", "username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_sem_grupo_key" ON "rh"."User"("username") WHERE "grupoId" IS NULL;

DROP INDEX IF EXISTS "rh"."User_username_key";
