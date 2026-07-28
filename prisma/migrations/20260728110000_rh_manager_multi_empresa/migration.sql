-- RH_MANAGER passa a poder ver mais de uma empresa (CNPJ) — o cadastro de
-- usuário só deixava escolher uma. `empresaId` fica só para GESTOR_SETOR
-- (um setor pertence a uma única empresa); RH_MANAGER passa a usar
-- `empresaIds`.
--
-- Backfill em vez de migrar a coluna: quem já era RH_MANAGER continua
-- vendo exatamente a mesma empresa de antes, sem precisar ser recadastrado.

ALTER TABLE "rh"."User" ADD COLUMN "empresaIds" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "rh"."User"
   SET "empresaIds" = ARRAY["empresaId"]
 WHERE role = 'RH_MANAGER' AND "empresaId" IS NOT NULL;
