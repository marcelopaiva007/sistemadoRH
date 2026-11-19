-- Acessos ao app Mobility (v1.208.0).
--
-- Pedido do CEO em 19/11/2026: nova aba na Frota para gerenciar usuário e senha
-- de cada motorista no app de recarga Mobility. A senha entra cifrada
-- (AES-256-GCM, chave derivada do AUTH_SECRET) — nunca em texto puro.
-- Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."AcessoMobility" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT NOT NULL,
    "senhaCifrada" TEXT,
    "senhaDica" TEXT,
    "placa" TEXT,
    "modelo" TEXT,
    "veiculoId" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcessoMobility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcessoMobility_empresaId_email_key" ON "rh"."AcessoMobility"("empresaId", "email");
CREATE INDEX IF NOT EXISTS "AcessoMobility_empresaId_ativo_idx" ON "rh"."AcessoMobility"("empresaId", "ativo");
