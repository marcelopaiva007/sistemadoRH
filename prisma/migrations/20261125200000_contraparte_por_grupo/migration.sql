-- Contraparte passa a ter GRUPO dono (25/11/2026).
--
-- Até aqui `Contraparte` não tinha dono e o CNPJ/CPF era único no banco
-- inteiro. Com dois clientes (grupos) no mesmo sistema, isso vazava: a tela de
-- Contrapartes listava fornecedor de outro cliente, editar pelo id mudava o
-- cadastro dele, o aviso "já cadastrado como X" revelava a razão social que o
-- outro cliente usa, e `salvarContrato` aceitava contraparte de outro grupo.
--
-- O que esta migration faz, em ordem:
--   1. coluna `grupoId` (nula) + FK para Grupo;
--   2. BACKFILL do grupo, nesta precedência:
--      a. pelos CONTRATOS (contrato → empresa → marca → grupo). Se os
--         contratos são de mais de um grupo, o "principal" é o que tem mais
--         contratos (empate: o do contrato mais antigo);
--      b. sem contrato: pelo AuditLog da criação (`entidade = 'Contraparte'`,
--         `acao = 'CRIAR'`), cujo `empresaId` é o CNPJ da tela onde ela foi
--         cadastrada;
--      c. sem isso: pelo grupo de quem criou (`criadoPorId` → User.grupoId);
--   3. derruba o único antigo (`cnpjCpf` sozinho) — precisa sair ANTES do
--      passo 4, senão a cópia, que tem o mesmo cnpjCpf, seria recusada;
--   4. contraparte usada por contratos de DOIS ou mais grupos: a linha fica
--      com o grupo principal e é DUPLICADA para cada outro grupo, e os
--      contratos desse outro grupo passam a apontar para a cópia. Cada grupo
--      fica com o seu cadastro — editar o endereço de notificação de um não
--      muda o do outro, que é exatamente o isolamento pedido;
--   5. cria o único novo, `(grupoId, cnpjCpf)`.
--
-- O que NÃO se resolve: contraparte sem contrato, sem registro de criação e
-- sem criador com grupo fica com `grupoId` NULO. A aplicação filtra sempre
-- por `grupoId = <grupo do usuário>`, então essa linha NÃO aparece para
-- ninguém (falha fechada, mesma regra de `empresasDoGrupo(null)`). É o mais
-- seguro: entregá-la a um grupo por chute seria vazar o cadastro, e uma
-- contraparte sem contrato não faz falta a ninguém — se fizer, recadastra-se.
-- O NOTICE no fim lista quantas ficaram assim; para ver quais:
--   SELECT id, "razaoSocial", "cnpjCpf" FROM "rh"."Contraparte" WHERE "grupoId" IS NULL;
--
-- Idempotente como as demais (IF [NOT] EXISTS, ON CONFLICT, UPDATE só onde
-- falta): rodar de novo não duplica nada nem reaponta contrato já certo.

-- 1. Coluna e FK ─────────────────────────────────────────────────────────────
ALTER TABLE "rh"."Contraparte" ADD COLUMN IF NOT EXISTS "grupoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "rh"."Contraparte"
    ADD CONSTRAINT "Contraparte_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2a. Grupo principal pelos contratos ────────────────────────────────────────
-- Uma linha por (contraparte, grupo) com a contagem de contratos e o contrato
-- mais antigo; `row_number` escolhe o principal de cada contraparte.
WITH por_grupo AS (
  SELECT ct."contraparteId",
         m."grupoId",
         COUNT(*)            AS contratos,
         MIN(ct."createdAt") AS primeiro
    FROM "rh"."Contrato" ct
    JOIN "rh"."Empresa"  e ON e."id" = ct."empresaId"
    JOIN "rh"."Marca"    m ON m."id" = e."marcaId"
   GROUP BY ct."contraparteId", m."grupoId"
), principal AS (
  SELECT "contraparteId", "grupoId"
    FROM (
      SELECT pg.*,
             row_number() OVER (
               PARTITION BY pg."contraparteId"
               ORDER BY pg.contratos DESC, pg.primeiro ASC, pg."grupoId" ASC
             ) AS ordem
        FROM por_grupo pg
    ) x
   WHERE x.ordem = 1
)
UPDATE "rh"."Contraparte" c
   SET "grupoId" = p."grupoId"
  FROM principal p
 WHERE p."contraparteId" = c."id"
   AND c."grupoId" IS NULL;

-- 2b. Sem contrato: pelo registro de criação no AuditLog ─────────────────────
-- O `empresaId` do log é o CNPJ da URL de onde a pessoa cadastrou. Se houver
-- mais de um registro (não deveria), vale o mais antigo.
UPDATE "rh"."Contraparte" c
   SET "grupoId" = sub."grupoId"
  FROM (
    SELECT DISTINCT ON (a."entidadeId") a."entidadeId", m."grupoId"
      FROM "rh"."AuditLog" a
      JOIN "rh"."Empresa"  e ON e."id" = a."empresaId"
      JOIN "rh"."Marca"    m ON m."id" = e."marcaId"
     WHERE a."entidade" = 'Contraparte'
       AND a."acao" = 'CRIAR'
       AND a."entidadeId" IS NOT NULL
     ORDER BY a."entidadeId", a."createdAt" ASC
  ) sub
 WHERE sub."entidadeId" = c."id"
   AND c."grupoId" IS NULL;

-- 2c. Último recurso: o grupo de quem criou ──────────────────────────────────
-- MASTER e conta sem grupo têm `grupoId` nulo — não resolvem nada, de propósito.
UPDATE "rh"."Contraparte" c
   SET "grupoId" = u."grupoId"
  FROM "rh"."User" u
 WHERE u."id" = c."criadoPorId"
   AND u."grupoId" IS NOT NULL
   AND c."grupoId" IS NULL;

-- 3. Sai o único antigo ─────────────────────────────────────────────────────
-- Antes das cópias: com ele de pé, o INSERT abaixo (mesmo cnpjCpf, outro
-- grupo) violaria "Contraparte_cnpjCpf_key" — e o ON CONFLICT ("id") não
-- arbitra violação de outro índice, a migration morreria ali.
DROP INDEX IF EXISTS "rh"."Contraparte_cnpjCpf_key";

-- 4. Contraparte compartilhada entre grupos: uma cópia por grupo extra ───────
-- O id da cópia é DETERMINÍSTICO (md5 do id original + grupo), não cuid: é o
-- que torna o passo idempotente — rodar de novo cai no ON CONFLICT em vez de
-- criar uma terceira linha. O prefixo `cpg_` deixa as cópias fáceis de achar.
-- Copia todos os campos de cadastro; `criadoPor*` e `createdAt` também, porque
-- a cópia representa o mesmo cadastro, só que agora com dono.
INSERT INTO "rh"."Contraparte" (
  "id", "grupoId", "tipoPessoa", "razaoSocial", "nomeFantasia", "cnpjCpf",
  "inscricaoEstadual", "endereco", "emailNotificacaoFormal", "telefone",
  "papeis", "criticidade", "observacoes", "criadoPorId", "criadoPorNome",
  "createdAt", "updatedAt"
)
SELECT DISTINCT ON (c."id", m."grupoId")
       'cpg_' || md5(c."id" || ':' || m."grupoId"),
       m."grupoId",
       c."tipoPessoa", c."razaoSocial", c."nomeFantasia", c."cnpjCpf",
       c."inscricaoEstadual", c."endereco", c."emailNotificacaoFormal", c."telefone",
       c."papeis", c."criticidade", c."observacoes", c."criadoPorId", c."criadoPorNome",
       c."createdAt", NOW()
  FROM "rh"."Contraparte" c
  JOIN "rh"."Contrato"    ct ON ct."contraparteId" = c."id"
  JOIN "rh"."Empresa"     e  ON e."id" = ct."empresaId"
  JOIN "rh"."Marca"       m  ON m."id" = e."marcaId"
 WHERE c."grupoId" IS NOT NULL
   AND m."grupoId" <> c."grupoId"
ON CONFLICT ("id") DO NOTHING;

-- Repontar os contratos do grupo "extra" para a cópia do próprio grupo. Depois
-- disto, todo contrato aponta para uma contraparte do MESMO grupo do CNPJ que
-- assina — a regra que a aplicação passa a exigir em `salvarContrato`.
UPDATE "rh"."Contrato" ct
   SET "contraparteId" = 'cpg_' || md5(c."id" || ':' || m."grupoId")
  FROM "rh"."Contraparte" c,
       "rh"."Empresa"     e,
       "rh"."Marca"       m
 WHERE c."id" = ct."contraparteId"
   AND e."id" = ct."empresaId"
   AND m."id" = e."marcaId"
   AND c."grupoId" IS NOT NULL
   AND m."grupoId" <> c."grupoId";

-- 5. O único novo ────────────────────────────────────────────────────────────
-- Não há como colidir: antes desta migration o cnpjCpf era único no banco
-- inteiro, e cada cópia do passo 4 é de um grupo diferente do original. Linhas
-- com `grupoId` nulo não conflitam entre si (NULL não é igual a NULL num
-- índice único do Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS "Contraparte_grupoId_cnpjCpf_key"
  ON "rh"."Contraparte"("grupoId", "cnpjCpf");

-- Relatório: quantas ficaram sem dono (invisíveis para todos) e quantas cópias
-- foram criadas. Aparece no log do `prisma migrate deploy` do build.
DO $$
DECLARE
  sem_grupo INTEGER;
  copias    INTEGER;
BEGIN
  SELECT COUNT(*) INTO sem_grupo FROM "rh"."Contraparte" WHERE "grupoId" IS NULL;
  SELECT COUNT(*) INTO copias    FROM "rh"."Contraparte" WHERE "id" LIKE 'cpg\_%';
  RAISE NOTICE 'Contraparte por grupo: % sem grupo (invisíveis), % cópia(s) por grupo extra', sem_grupo, copias;
END $$;
