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

-- 4b. Marca já bloqueados quem o Telegram recusou ANTES desta versão (pedido
-- de 19/11: Alexandre, Cícero, Daniella e Gracielly seguiam "Telegram ativo").
-- Fonte: o erro gravado no recibo de contracheque MAIS RECENTE de cada
-- pessoa. Só marca quem ainda tem chat gravado; se a pessoa já reativou, a
-- marca some sozinha no próximo envio que der certo ou quando ela falar com
-- o bot (lib/telegram.ts).
UPDATE "rh"."Colaborador" c
SET "telegramInvalidoEm" = r."enviadoEm",
    "telegramInvalidoMotivo" = LEFT(r."envioErro", 200)
FROM (
  SELECT DISTINCT ON ("colaboradorId") "colaboradorId", "enviadoEm", "envioErro"
  FROM "rh"."ReciboContracheque"
  WHERE "enviadoEm" IS NOT NULL
  ORDER BY "colaboradorId", "enviadoEm" DESC
) r
WHERE r."colaboradorId" = c."id"
  AND c."telegramChatId" IS NOT NULL
  AND c."telegramInvalidoEm" IS NULL
  AND r."envioErro" ~* '(bot was blocked by the user|chat not found|user is deactivated|bot can.t initiate conversation)';
