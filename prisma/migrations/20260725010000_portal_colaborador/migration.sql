-- Portal do colaborador — acesso sem senha, pelo bot do Telegram.
--
-- Aditiva: só cria tabelas e uma coluna nova no schema `rh`. Roda com o app no
-- ar. Escrita com IF NOT EXISTS / guardas de constraint para poder ser
-- reaplicada (o SQL deste projeto é aplicado à mão — ver README).
--
--   * Colaborador.portalVerificadoEm -> marca a confirmação de CPF na primeira
--     entrada no portal. O vínculo do Telegram casa pelos últimos 8 dígitos do
--     telefone do elleven: margem tolerável para convidar a uma pesquisa,
--     inaceitável para abrir salário e documentos.
--   * PortalAcesso  -> token de login de vida curta e uso único (SHA-256).
--   * PortalSessao  -> sessão em cookie depois que o token é queimado.

-- AlterTable
ALTER TABLE "rh"."Colaborador"
  ADD COLUMN IF NOT EXISTS "portalVerificadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."PortalAcesso" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "canal" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."PortalSessao" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "encerradaEm" TIMESTAMP(3),
    "tentativasCpf" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcessoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PortalAcesso_tokenHash_key" ON "rh"."PortalAcesso"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalAcesso_colaboradorId_usadoEm_idx" ON "rh"."PortalAcesso"("colaboradorId", "usadoEm");
CREATE UNIQUE INDEX IF NOT EXISTS "PortalSessao_tokenHash_key" ON "rh"."PortalSessao"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalSessao_colaboradorId_encerradaEm_idx" ON "rh"."PortalSessao"("colaboradorId", "encerradaEm");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."PortalAcesso" ADD CONSTRAINT "PortalAcesso_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."PortalSessao" ADD CONSTRAINT "PortalSessao_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
