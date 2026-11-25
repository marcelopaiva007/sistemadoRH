-- Retrato do desligamento + causa gerencial (27/11/2026).
--
-- Primeira entrega da área Desligamentos. Duas coisas, ambas só ACRESCENTAM:
--
--   1. `Colaborador.causaDesligamento` — a causa gerencial da saída
--      (desempenho, comportamento, reestruturação, pedido do colaborador, fim
--      de contrato/experiência, outros). Nula para todo o histórico: nenhuma
--      ficha existente é tocada. Passa a ser obrigatória nas actions que
--      registram um desligamento NOVO.
--
--   2. Tabela `RetratoDesligamento` — setor, cargo, líder e admissão como
--      estavam no dia da saída. Vazia ao nascer: o histórico anterior NÃO é
--      reconstituído, porque a única fonte seria o setor ATUAL da ficha, que é
--      justamente o dado que o retrato existe para não usar. A tela avisa que
--      saídas sem retrato contam no setor da ficha.
--
-- Idempotente como as demais.

ALTER TABLE "rh"."Colaborador" ADD COLUMN IF NOT EXISTS "causaDesligamento" TEXT;

CREATE TABLE IF NOT EXISTS "rh"."RetratoDesligamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "setorId" TEXT,
    "setorNome" TEXT NOT NULL,
    "posicaoId" TEXT,
    "posicaoNome" TEXT NOT NULL,
    "supervisorId" TEXT,
    "supervisorNome" TEXT,
    "dataAdmissao" TIMESTAMP(3),
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,

    CONSTRAINT "RetratoDesligamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RetratoDesligamento_colaboradorId_key" ON "rh"."RetratoDesligamento"("colaboradorId");
CREATE INDEX IF NOT EXISTS "RetratoDesligamento_empresaId_idx" ON "rh"."RetratoDesligamento"("empresaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RetratoDesligamento_colaboradorId_fkey'
  ) THEN
    ALTER TABLE "rh"."RetratoDesligamento"
      ADD CONSTRAINT "RetratoDesligamento_colaboradorId_fkey"
      FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
