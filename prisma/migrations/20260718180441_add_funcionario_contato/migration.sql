-- AlterTable (idempotente — mesmo padrão da migração de CPF)
ALTER TABLE "Funcionario" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Funcionario" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
