-- Fase 6 — estrutura do grupo: marca acima, CNPJ abaixo.
--
-- A `Empresa` que já existe É a pessoa jurídica (o CNPJ): 33 tabelas apontam
-- para ela, incluindo Colaborador e a folha. Ela não é substituída — ganha os
-- campos de identificação e um vínculo com a Marca, que entra ACIMA dela.
--
-- Ordem obrigatória: `marcaId` é NOT NULL, então as marcas precisam existir e
-- estar preenchidas antes da restrição entrar. Tudo em uma transação (o
-- scripts/aplicar-migracao.ts envolve o arquivo inteiro).

CREATE TABLE "rh"."Marca" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "logoUrl"   TEXT,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Marca_nome_key" ON "rh"."Marca"("nome");

-- Campos da pessoa jurídica. Todos opcionais: as três empresas existentes
-- foram criadas antes desta fase e o CNPJ ainda não foi levantado. Quem cobra
-- o preenchimento é a tela.
ALTER TABLE "rh"."Empresa"
  ADD COLUMN "marcaId"           TEXT,
  ADD COLUMN "razaoSocial"       TEXT,
  ADD COLUMN "nomeFantasia"      TEXT,
  ADD COLUMN "cnpj"              TEXT,
  ADD COLUMN "inscricaoEstadual" TEXT,
  ADD COLUMN "cidade"            TEXT,
  ADD COLUMN "uf"                TEXT;

-- Uma marca por empresa existente, com o mesmo nome. É o ponto de partida
-- honesto: hoje cada marca do grupo tem uma pessoa jurídica cadastrada. Quando
-- o RH informar os demais CNPJs, eles entram pela tela sob a marca certa.
--
-- O id da marca é derivado do id da empresa para a migração ser idempotente:
-- rodar de novo não cria marca duplicada.
INSERT INTO "rh"."Marca" ("id", "nome", "ativo", "createdAt", "updatedAt")
SELECT 'mrc_' || e."id", e."nome", e."ativo", e."createdAt", CURRENT_TIMESTAMP
FROM "rh"."Empresa" e
ON CONFLICT ("id") DO NOTHING;

UPDATE "rh"."Empresa" e
SET "marcaId" = 'mrc_' || e."id"
WHERE e."marcaId" IS NULL;

-- Só agora a restrição pode entrar: nenhuma linha ficou sem marca.
ALTER TABLE "rh"."Empresa"
  ALTER COLUMN "marcaId" SET NOT NULL;

ALTER TABLE "rh"."Empresa"
  ADD CONSTRAINT "Empresa_marcaId_fkey"
  FOREIGN KEY ("marcaId") REFERENCES "rh"."Marca"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Empresa_marcaId_idx" ON "rh"."Empresa"("marcaId");

-- CNPJ é único entre as empresas. Índice único aceita vários NULL no Postgres,
-- então as empresas ainda sem número não colidem entre si.
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "rh"."Empresa"("cnpj");
