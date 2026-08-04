-- AlterTable
ALTER TABLE "rh"."Marca" ADD COLUMN "corPrimaria" TEXT;

-- CreateTable
CREATE TABLE "rh"."TipoBeneficio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TipoBeneficio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TipoBeneficio_empresaId_idx" ON "rh"."TipoBeneficio"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoBeneficio_empresaId_nome_key" ON "rh"."TipoBeneficio"("empresaId", "nome");

-- AddForeignKey
ALTER TABLE "rh"."TipoBeneficio" ADD CONSTRAINT "TipoBeneficio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
