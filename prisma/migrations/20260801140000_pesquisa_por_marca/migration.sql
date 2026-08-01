-- Pesquisa passa a pertencer à MARCA, não ao CNPJ.
--
-- Antes o único vínculo era `empresaId`. Como as telas filtravam por ele, uma
-- pesquisa criada na RSM TELECOM sumia para os outros quatro CNPJs da LM
-- Telecom — e sumia calada, o que parecia dado perdido. A saída até aqui era
-- criar uma pesquisa por CNPJ, o que enche a lista de duplicatas: em 01/08/2026
-- havia cinco "Pulso de Clima 2026 T3" idênticos, um por empresa da marca.
--
-- `empresaId` continua na tabela: registra em qual CNPJ a pesquisa nasceu e
-- ainda é lido por telas e relatórios antigos. Remover coluna é irreversível e
-- não tem pressa — sai quando ninguém mais a usar.
--
-- Três passos para não deixar a coluna nula em nenhum momento: cria opcional,
-- preenche a partir da empresa, e só então torna obrigatória.

-- 1. Coluna opcional
ALTER TABLE "rh"."Pesquisa" ADD COLUMN IF NOT EXISTS "marcaId" TEXT;

-- 2. Backfill: a marca de cada pesquisa é a da empresa onde ela nasceu
UPDATE "rh"."Pesquisa" p
   SET "marcaId" = e."marcaId"
  FROM "rh"."Empresa" e
 WHERE e.id = p."empresaId"
   AND p."marcaId" IS NULL;

-- 3. Guarda: se sobrou alguma sem marca, aborta antes de tornar NOT NULL —
-- melhor falhar aqui do que deixar a tabela num estado que o Prisma não espera.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "rh"."Pesquisa" WHERE "marcaId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Abortado: % pesquisa(s) sem marca após o backfill — investigue antes de prosseguir.', n;
  END IF;
END $$;

ALTER TABLE "rh"."Pesquisa" ALTER COLUMN "marcaId" SET NOT NULL;

-- 4. Chave estrangeira e índice
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Pesquisa_marcaId_fkey') THEN
    ALTER TABLE "rh"."Pesquisa"
      ADD CONSTRAINT "Pesquisa_marcaId_fkey" FOREIGN KEY ("marcaId")
      REFERENCES "rh"."Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pesquisa_marcaId_status_idx" ON "rh"."Pesquisa"("marcaId", "status");
