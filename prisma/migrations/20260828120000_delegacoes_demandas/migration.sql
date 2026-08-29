-- Módulo DELEGAÇÕES (Fase 1, PR 2) — as seis tabelas do motor de cobrança:
-- Demanda (a unidade de cobrança), DemandaRepactuacao e DemandaEntrega (os
-- arrays da spec viraram tabelas filhas), DemandaInteracao (cobranças e
-- respostas, com a classificação da IA), DemandaEvento (log imutável) e
-- DemandaConfig (régua editável sem deploy).
--
-- Só CREATEs — nada existente é alterado; RH e Processos não são tocados.
-- FKs de Demanda para User são RESTRICT de propósito: o motor precisa de um
-- dono vivo, e usuário neste sistema é desativado, nunca apagado.
-- prazoOriginal não tem DEFAULT nem trigger: a imutabilidade é regra de
-- backend (nenhuma action escreve nele após o INSERT) — ver
-- lib/delegacoes/estados.ts e lib/actions/delegacoes.ts.
-- CreateTable
CREATE TABLE "rh"."Demanda" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "solicitanteId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "criterioAceite" TEXT NOT NULL,
    "evidenciaExigida" TEXT NOT NULL,
    "criticidade" INTEGER NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "prazoOriginal" TIMESTAMP(3) NOT NULL,
    "periodicidadeRetorno" TEXT NOT NULL,
    "marcaId" TEXT,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "emRisco" BOOLEAN NOT NULL DEFAULT false,
    "enviadaEm" TIMESTAMP(3),
    "aceiteEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "ultimaCobranca" TIMESTAMP(3),
    "proximaCobranca" TIMESTAMP(3),
    "nivelEscalonamento" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DemandaRepactuacao" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "prazoAnterior" TIMESTAMP(3) NOT NULL,
    "prazoNovo" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandaRepactuacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DemandaEntrega" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "evidenciaTipo" TEXT NOT NULL,
    "evidenciaTexto" TEXT,
    "arquivoId" TEXT,
    "resultado" TEXT,
    "aceita" BOOLEAN,
    "motivoDevolucao" TEXT,
    "avaliadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandaEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DemandaInteracao" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "classificacaoIa" TEXT,
    "confiancaIa" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandaInteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DemandaEvento" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DemandaConfig" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Demanda_proximaCobranca_status_idx" ON "rh"."Demanda"("proximaCobranca", "status");

-- CreateIndex
CREATE INDEX "Demanda_responsavelId_status_idx" ON "rh"."Demanda"("responsavelId", "status");

-- CreateIndex
CREATE INDEX "Demanda_solicitanteId_status_idx" ON "rh"."Demanda"("solicitanteId", "status");

-- CreateIndex
CREATE INDEX "Demanda_prazo_status_idx" ON "rh"."Demanda"("prazo", "status");

-- CreateIndex
CREATE INDEX "Demanda_marcaId_idx" ON "rh"."Demanda"("marcaId");

-- CreateIndex
CREATE INDEX "DemandaRepactuacao_demandaId_createdAt_idx" ON "rh"."DemandaRepactuacao"("demandaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DemandaEntrega_arquivoId_key" ON "rh"."DemandaEntrega"("arquivoId");

-- CreateIndex
CREATE INDEX "DemandaEntrega_demandaId_createdAt_idx" ON "rh"."DemandaEntrega"("demandaId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandaInteracao_demandaId_createdAt_idx" ON "rh"."DemandaInteracao"("demandaId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandaEvento_demandaId_createdAt_idx" ON "rh"."DemandaEvento"("demandaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DemandaConfig_chave_key" ON "rh"."DemandaConfig"("chave");

-- AddForeignKey
ALTER TABLE "rh"."Demanda" ADD CONSTRAINT "Demanda_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "rh"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."Demanda" ADD CONSTRAINT "Demanda_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "rh"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."Demanda" ADD CONSTRAINT "Demanda_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "rh"."Marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DemandaRepactuacao" ADD CONSTRAINT "DemandaRepactuacao_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "rh"."Demanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DemandaEntrega" ADD CONSTRAINT "DemandaEntrega_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "rh"."Demanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DemandaEntrega" ADD CONSTRAINT "DemandaEntrega_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DemandaInteracao" ADD CONSTRAINT "DemandaInteracao_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "rh"."Demanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DemandaEvento" ADD CONSTRAINT "DemandaEvento_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "rh"."Demanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

