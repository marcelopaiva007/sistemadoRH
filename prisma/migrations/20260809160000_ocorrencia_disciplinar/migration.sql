-- Medidas Disciplinares & Notificações: Advertências, Suspensões, Dano Patrimonial e Recusa.
--
-- Tabela para registro do histórico formal de ocorrências disciplinares e
-- acompanhamento de gradação de penas (CLT Art. 482).
--
-- Puramente ADITIVA: cria uma tabela nova e não toca em nenhuma existente.
CREATE TABLE "rh"."OcorrenciaDisciplinar" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "emitidoPorId" TEXT,
    "emitidoPorNome" TEXT,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalhes" TEXT,
    "dataFato" TIMESTAMP(3) NOT NULL,
    "diasSuspensao" INTEGER,
    "valorDesconto" DOUBLE PRECISION,
    "statusAssinatura" TEXT NOT NULL DEFAULT 'PENDENTE',
    "dataAssinatura" TIMESTAMP(3),
    "testemunha1Nome" TEXT,
    "testemunha1Cpf" TEXT,
    "testemunha2Nome" TEXT,
    "testemunha2Cpf" TEXT,
    "documentoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcorrenciaDisciplinar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OcorrenciaDisciplinar_empresaId_tipo_idx" ON "rh"."OcorrenciaDisciplinar"("empresaId", "tipo");

CREATE INDEX "OcorrenciaDisciplinar_colaboradorId_idx" ON "rh"."OcorrenciaDisciplinar"("colaboradorId");

ALTER TABLE "rh"."OcorrenciaDisciplinar" ADD CONSTRAINT "OcorrenciaDisciplinar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh"."OcorrenciaDisciplinar" ADD CONSTRAINT "OcorrenciaDisciplinar_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
