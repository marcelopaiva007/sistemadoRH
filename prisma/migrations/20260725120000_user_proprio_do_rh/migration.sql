-- Desacopla o Sistema do RH do lm-bonificacao.
--
-- Até aqui as duas aplicações dividiam a MESMA tabela de login (`shared.User`),
-- e a única referência do RH para fora era a FK
-- `rh.Pesquisa.criadoPorId -> shared.User`. Depois desta migração o RH tem a
-- sua própria tabela de usuários no schema `rh` e nenhum objeto do schema `rh`
-- aponta para fora dele.
--
-- Consequência a comunicar: o cadastro nasce de uma CÓPIA (mesmos usuários,
-- mesmas senhas no momento do corte), mas a partir daqui evolui separado —
-- criar usuário ou trocar senha em um sistema não muda nada no outro.
--
-- `shared.User` NÃO é tocada: o lm-bonificacao continua usando a dele, sem
-- precisar de deploy nem de alteração.
--
-- Segura para aplicar antes do deploy: enquanto o código antigo estiver no ar
-- ele continua lendo `shared.User`, que segue intacta e com os mesmos dados.

-- CreateTable: mesma estrutura de shared."User"
CREATE TABLE IF NOT EXISTS "rh"."User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT,
    "setorId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (nomes de índice são por schema, então não colidem com os de `shared`)
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "rh"."User"("username");
CREATE INDEX IF NOT EXISTS "User_empresaId_idx" ON "rh"."User"("empresaId");
CREATE INDEX IF NOT EXISTS "User_setorId_idx" ON "rh"."User"("setorId");

-- Cópia inicial dos usuários. O `WHERE NOT EXISTS` faz a carga acontecer uma
-- única vez: reaplicar a migração depois não ressuscita usuário que o RH
-- tenha excluído.
INSERT INTO "rh"."User" ("id", "nome", "username", "passwordHash", "role", "createdAt", "empresaId", "setorId")
SELECT "id", "nome", "username", "passwordHash", "role", "createdAt", "empresaId", "setorId"
FROM "shared"."User"
WHERE NOT EXISTS (SELECT 1 FROM "rh"."User");

-- A última referência do RH para fora do schema `rh`.
ALTER TABLE "rh"."Pesquisa" DROP CONSTRAINT IF EXISTS "Pesquisa_criadoPorId_fkey";

-- Recriada apontando para a tabela local, com a mesma regra de antes
-- (ON DELETE SET NULL / ON UPDATE CASCADE): excluir um usuário não apaga a
-- pesquisa que ele criou, só desamarra a autoria.
DO $$
BEGIN
  ALTER TABLE "rh"."Pesquisa" ADD CONSTRAINT "Pesquisa_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "rh"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
