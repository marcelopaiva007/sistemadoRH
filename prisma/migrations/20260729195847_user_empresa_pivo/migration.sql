-- Pivô UserEmpresa + colunas novas em User.
--
-- Rodar com:
--   npx tsx scripts/aplicar-migracao.ts 20260729195847_user_empresa_pivo
--   npx prisma migrate resolve --applied 20260729195847_user_empresa_pivo
--
-- Por que migration manual: este app divide o banco Neon com outros apps
-- (lm-bonificacao etc.) e a tabela `_prisma_migrations` é compartilhada.
-- `prisma migrate deploy` reaplicaria migrations de outros apps. Ver
-- scripts/aplicar-migracao.ts e o README, seção "Notas sobre o banco".

-- 1. Tabela pivô. CASCADE em userId: se um User é excluído, o vínculo morre
--    junto (sem órfão). RESTRICT em empresaId: não dá pra excluir empresa
--    que ainda tem gente vinculada — desativar (ativo=false) primeiro.
CREATE TABLE "rh"."UserEmpresa" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "rh"."User"("id") ON DELETE CASCADE,
  "empresaId"      TEXT NOT NULL REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT,
  "role"           TEXT NOT NULL,
  "setorId"        TEXT REFERENCES "rh"."Setor"("id") ON DELETE SET NULL,
  "ativo"          BOOLEAN NOT NULL DEFAULT true,
  "papelPrincipal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "UserEmpresa_userId_empresaId_key"
  ON "rh"."UserEmpresa"("userId","empresaId");
CREATE INDEX "UserEmpresa_empresaId_idx" ON "rh"."UserEmpresa"("empresaId");
CREATE INDEX "UserEmpresa_userId_idx"    ON "rh"."UserEmpresa"("userId");

-- 2. Migrar dados existentes.
--    ADMIN/DIRETORIA ficam de fora (empresaId IS NULL) — são perfis globais.
--    Para RH_MANAGER sem setorId, papel vira "RH_MANAGER".
--    Para GESTOR_SETOR (setorId não nulo), papel vira "GESTOR_SETOR".
--    papelPrincipal=true em todas — o user só tinha uma empresa mesmo.
INSERT INTO "rh"."UserEmpresa"
  ("id", "userId", "empresaId", "role", "setorId", "ativo", "papelPrincipal")
SELECT
  'ue_' || md5(random()::text || clock_timestamp()::text),
  "id",
  "empresaId",
  CASE WHEN "setorId" IS NOT NULL THEN 'GESTOR_SETOR' ELSE 'RH_MANAGER' END,
  "setorId",
  true,
  true
FROM "rh"."User"
WHERE "empresaId" IS NOT NULL
  AND "role" IN ('RH_MANAGER','GESTOR_SETOR');

-- 3. Colunas novas em User. Mantém `empresaId`/`setorId` por enquanto
--    (rollback barato — a remoção é a Fase 8 do plano multi-empresa).
ALTER TABLE "rh"."User"
  ADD COLUMN "ativo"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email"            TEXT,
  ADD COLUMN "telefone"         TEXT,
  ADD COLUMN "avatarUrl"        TEXT,
  ADD COLUMN "conviteExpiraEm"  TIMESTAMP,
  ADD COLUMN "conviteTokenHash" TEXT,
  ADD COLUMN "ultimoAcessoEm"   TIMESTAMP;

CREATE UNIQUE INDEX "User_email_key" ON "rh"."User"("email");