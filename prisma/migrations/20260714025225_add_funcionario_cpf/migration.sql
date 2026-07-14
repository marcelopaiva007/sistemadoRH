-- AlterTable
ALTER TABLE "Funcionario" ADD COLUMN "cpf" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_cpf_key" ON "Funcionario"("cpf");
