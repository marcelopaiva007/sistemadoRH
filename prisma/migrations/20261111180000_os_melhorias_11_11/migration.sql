-- OS de melhorias de 11/11/2026 (v1.204.0). Só colunas novas, todas
-- anuláveis ou com padrão, e uma tabela nova: nada é reescrito nem apagado.
--
-- 1. Fila do teto diário de e-mail dos contracheques.
ALTER TABLE "rh"."ReciboContracheque" ADD COLUMN IF NOT EXISTS "emailNaFilaDesde" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ReciboContracheque_emailNaFilaDesde_idx" ON "rh"."ReciboContracheque"("emailNaFilaDesde");

-- 3. Canal de cada lembrete automático.
CREATE TABLE IF NOT EXISTS "rh"."ConfiguracaoCanalLembrete" (
    "chave" TEXT NOT NULL,
    "usarEmail" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,
    CONSTRAINT "ConfiguracaoCanalLembrete_pkey" PRIMARY KEY ("chave")
);

-- 4. Telegram bloqueado / chat inexistente.
ALTER TABLE "rh"."Colaborador" ADD COLUMN IF NOT EXISTS "telegramInvalidoEm" TIMESTAMP(3);
ALTER TABLE "rh"."Colaborador" ADD COLUMN IF NOT EXISTS "telegramInvalidoMotivo" TEXT;

-- 6. Transferência de colaborador entre empresas do grupo.
ALTER TABLE "rh"."Movimentacao" ADD COLUMN IF NOT EXISTS "empresaAnteriorId" TEXT;
ALTER TABLE "rh"."Movimentacao" ADD COLUMN IF NOT EXISTS "empresaAnteriorNome" TEXT;
ALTER TABLE "rh"."Movimentacao" ADD COLUMN IF NOT EXISTS "empresaNovaNome" TEXT;

-- 8. Tipo do veículo informado à mão (nulo = deduzido, como antes).
ALTER TABLE "rh"."Veiculo" ADD COLUMN IF NOT EXISTS "tipo" TEXT;
