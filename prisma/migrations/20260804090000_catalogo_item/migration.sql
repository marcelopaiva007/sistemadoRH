-- CreateTable
CREATE TABLE "rh"."CatalogoItem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "validadeMeses" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogoItem_empresaId_categoria_idx" ON "rh"."CatalogoItem"("empresaId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoItem_empresaId_categoria_nome_key" ON "rh"."CatalogoItem"("empresaId", "categoria", "nome");

-- AddForeignKey
ALTER TABLE "rh"."CatalogoItem" ADD CONSTRAINT "CatalogoItem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
