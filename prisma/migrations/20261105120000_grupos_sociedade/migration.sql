-- Grupos de sociedade (v1.185.0): a LM Telecom sai do convívio com as demais
-- marcas. Grupo → Marca → Empresa; cada usuário de trabalho pertence a um grupo.
--
-- O que esta migration decide sozinha, e por quê:
--   * Cria dois grupos: "LM Telecom" e "Demais marcas".
--   * A marca cujo nome é "LM Telecom" (ou "L&M Telecom") vai para o grupo LM;
--     todas as outras para "Demais marcas". Se o nome não bater, a LM fica em
--     "Demais marcas" e o MASTER a move pela tela de Grupos — nada se perde.
--   * Usuário cujos vínculos ativos (por CNPJ ou por marca) são TODOS da LM vai
--     para o grupo LM. Qualquer outro — inclusive ADMIN e DIRETORIA, que não
--     têm vínculo — vai para "Demais marcas". É o lado conservador: ninguém de
--     fora da LM passa a enxergar a LM; quem precisa ver a LM e caiu no outro
--     grupo ganha login novo no grupo LM pelo MASTER (decisão do CEO: um login
--     por grupo).
--
-- Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."Grupo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Grupo_nome_key" ON "rh"."Grupo"("nome");

INSERT INTO "rh"."Grupo" ("id", "nome") VALUES
    ('grupo_demais_marcas', 'Demais marcas'),
    ('grupo_lm_telecom', 'LM Telecom')
ON CONFLICT DO NOTHING;

-- Marca.grupoId
ALTER TABLE "rh"."Marca" ADD COLUMN IF NOT EXISTS "grupoId" TEXT;
UPDATE "rh"."Marca" SET "grupoId" = 'grupo_lm_telecom'
 WHERE "grupoId" IS NULL
   AND lower(regexp_replace("nome", '\s+', ' ', 'g')) IN ('lm telecom', 'l&m telecom', 'l & m telecom');
UPDATE "rh"."Marca" SET "grupoId" = 'grupo_demais_marcas' WHERE "grupoId" IS NULL;
ALTER TABLE "rh"."Marca" ALTER COLUMN "grupoId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Marca_grupoId_idx" ON "rh"."Marca"("grupoId");
DO $$ BEGIN
    ALTER TABLE "rh"."Marca" ADD CONSTRAINT "Marca_grupoId_fkey"
        FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User.grupoId
ALTER TABLE "rh"."User" ADD COLUMN IF NOT EXISTS "grupoId" TEXT;
CREATE INDEX IF NOT EXISTS "User_grupoId_idx" ON "rh"."User"("grupoId");
DO $$ BEGIN
    ALTER TABLE "rh"."User" ADD CONSTRAINT "User_grupoId_fkey"
        FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

WITH vinculos AS (
    SELECT ue."userId", m."grupoId"
      FROM "rh"."UserEmpresa" ue
      JOIN "rh"."Empresa" e ON e."id" = ue."empresaId"
      JOIN "rh"."Marca" m ON m."id" = e."marcaId"
     WHERE ue."ativo" = true
    UNION ALL
    SELECT um."userId", m."grupoId"
      FROM "rh"."UserMarca" um
      JOIN "rh"."Marca" m ON m."id" = um."marcaId"
     WHERE um."ativo" = true
),
so_lm AS (
    SELECT "userId" FROM vinculos
     GROUP BY "userId"
    HAVING bool_and("grupoId" = 'grupo_lm_telecom')
)
UPDATE "rh"."User" u SET "grupoId" = 'grupo_lm_telecom'
  FROM so_lm
 WHERE u."id" = so_lm."userId" AND u."grupoId" IS NULL AND u."role" NOT IN ('ADMIN', 'DIRETORIA', 'MASTER');

UPDATE "rh"."User" SET "grupoId" = 'grupo_demais_marcas'
 WHERE "grupoId" IS NULL AND "role" <> 'MASTER';
