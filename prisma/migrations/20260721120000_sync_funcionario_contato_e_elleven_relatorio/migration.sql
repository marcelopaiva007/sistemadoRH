-- Reconciliação de histórico: estas mudanças já foram aplicadas diretamente
-- no banco (fora do fluxo de migrations) em sessão/trabalho anterior sobre
-- importação elleven. Esta migração NÃO é executada contra o banco de
-- produção (é marcada como já aplicada via `prisma migrate resolve --applied`),
-- serve apenas para o histórico local de migrations refletir o estado real.
--
-- TUDO AQUI É IDEMPOTENTE, e isso não é preciosismo: desde 04/08/2026 o CI
-- roda `prisma migrate deploy` num Postgres vazio para poder rodar o build.
-- Ali o histórico é reproduzido do zero, e esta migração É executada — logo
-- depois de 20260718180441_add_funcionario_contato, que já criou as mesmas
-- colunas. Sem os IF NOT EXISTS o replay morre em "column already exists"
-- (42701) e reprova toda PR, como aconteceu com as 7 do Dependabot.

-- AlterTable
ALTER TABLE "Funcionario" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Funcionario" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "elleven_relatorio_linha" (
    "id" SERIAL NOT NULL,
    "relatorio" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elleven_relatorio_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_chave_key" ON "elleven_relatorio_linha"("relatorio", "periodo", "chave");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_idx" ON "elleven_relatorio_linha"("relatorio", "periodo");
