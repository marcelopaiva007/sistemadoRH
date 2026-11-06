-- Perfis de acesso por cliente (v1.199.0, Fase 1 da Gestão FASTMAI).
--
-- Decisão do CEO em 06/11/2026: a FASTMAI mantém MODELOS de perfil, e cada
-- cliente recebe uma CÓPIA própria, que ele ajusta sem afetar os outros.
--
-- O que esta migration faz, e por que ninguém ganha nem perde acesso:
--   1. Perfil ganha grupoId. Os perfis de hoje ficam como MODELOS (null).
--   2. O nome deixa de ser único no sistema e passa a ser único por cliente;
--      os modelos seguem únicos entre si (índice parcial).
--   3. Cada cliente ganha uma cópia de cada modelo, com as MESMAS permissões.
--      O id da cópia é derivado (modelo + cliente): rodar de novo não duplica.
--   4. Cada atribuição de perfil a uma conta de cliente passa a apontar para a
--      cópia do cliente dela — mesmas permissões, então o acesso é idêntico.
--      Conta sem cliente (MASTER/legado) continua no modelo.
-- Idempotente como as demais.

ALTER TABLE "rh"."Perfil" ADD COLUMN IF NOT EXISTS "grupoId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Perfil_grupoId_fkey') THEN
    ALTER TABLE "rh"."Perfil" ADD CONSTRAINT "Perfil_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Perfil_grupoId_idx" ON "rh"."Perfil"("grupoId");

CREATE UNIQUE INDEX IF NOT EXISTS "Perfil_grupoId_nome_key" ON "rh"."Perfil"("grupoId", "nome");
CREATE UNIQUE INDEX IF NOT EXISTS "Perfil_nome_modelo_key" ON "rh"."Perfil"("nome") WHERE "grupoId" IS NULL;
DROP INDEX IF EXISTS "rh"."Perfil_nome_key";

INSERT INTO "rh"."Perfil" ("id", "nome", "descricao", "grants", "sistema", "ativo", "grupoId", "createdAt", "updatedAt")
SELECT 'pc_' || md5(p."id" || ':' || g."id"), p."nome", p."descricao", p."grants", p."sistema", p."ativo", g."id",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "rh"."Perfil" p
 CROSS JOIN "rh"."Grupo" g
 WHERE p."grupoId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "rh"."UserPerfil" up
   SET "perfilId" = 'pc_' || md5(up."perfilId" || ':' || u."grupoId")
  FROM "rh"."User" u, "rh"."Perfil" p
 WHERE up."userId" = u."id"
   AND p."id" = up."perfilId"
   AND p."grupoId" IS NULL
   AND u."grupoId" IS NOT NULL;
