-- CreateTable
CREATE TABLE "rh"."PlanoAcao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pesquisaId" TEXT,
    "setorId" TEXT,
    "dimensaoCodigo" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavelId" TEXT,
    "responsavelNome" TEXT,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "concluidoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoAcao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanoAcao_empresaId_status_idx" ON "rh"."PlanoAcao"("empresaId", "status");

-- CreateIndex
CREATE INDEX "PlanoAcao_pesquisaId_idx" ON "rh"."PlanoAcao"("pesquisaId");

-- CreateIndex
CREATE INDEX "PlanoAcao_setorId_status_idx" ON "rh"."PlanoAcao"("setorId", "status");

-- AddForeignKey
ALTER TABLE "rh"."PlanoAcao" ADD CONSTRAINT "PlanoAcao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."PlanoAcao" ADD CONSTRAINT "PlanoAcao_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "rh"."Pesquisa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."PlanoAcao" ADD CONSTRAINT "PlanoAcao_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "rh"."Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
