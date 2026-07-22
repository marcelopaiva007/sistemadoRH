-- Reconciliação de histórico: estas mudanças já foram aplicadas diretamente
-- no banco (fora do fluxo de migrations) em sessão/trabalho anterior sobre
-- importação elleven. Esta migração NÃO é executada contra o banco de
-- produção (é marcada como já aplicada via `prisma migrate resolve --applied`),
-- serve apenas para o histórico local de migrations refletir o estado real.

-- AlterTable
ALTER TABLE "Funcionario" ADD COLUMN "email" TEXT;
ALTER TABLE "Funcionario" ADD COLUMN "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "elleven_relatorio_linha" (
    "id" SERIAL NOT NULL,
    "relatorio" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elleven_relatorio_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elleven_relatorio_linha_relatorio_periodo_chave_key" ON "elleven_relatorio_linha"("relatorio", "periodo", "chave");

-- CreateIndex
CREATE INDEX "elleven_relatorio_linha_relatorio_periodo_idx" ON "elleven_relatorio_linha"("relatorio", "periodo");
