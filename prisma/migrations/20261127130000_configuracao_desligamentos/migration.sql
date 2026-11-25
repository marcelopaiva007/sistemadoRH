-- Configuração da área Desligamentos (27/11/2026).
--
-- Os números que a diretoria usa para cobrar os gestores NÃO ficam no código:
-- cada cliente (Grupo) tem os seus. Duas tabelas, ambas só ACRESCENTAM e nascem
-- vazias — sem linha, a área usa os padrões (meta 10%, limite 15%, R$ 4.000
-- por desligamento), escritos no código só como ponto de partida.
--
--   1. `ConfiguracaoDesligamentos` — uma linha por grupo: custo por
--      desligamento (em CENTAVOS, inteiro, como Grupo.valorMensalCentavos),
--      meta e limite anuais em % do quadro médio.
--
--   2. `IndicadorNegocioAno` — crescimento da base de clientes e do faturamento
--      de cada ano, digitado à mão (o sistema não tem essa informação), para
--      comparar com o crescimento da equipe. Um por grupo e ano.
--
-- Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."ConfiguracaoDesligamentos" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "custoPorDesligamentoCentavos" INTEGER NOT NULL DEFAULT 400000,
    "metaPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "limitePct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPorId" TEXT,
    "atualizadoPorNome" TEXT,

    CONSTRAINT "ConfiguracaoDesligamentos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConfiguracaoDesligamentos_grupoId_key" ON "rh"."ConfiguracaoDesligamentos"("grupoId");

CREATE TABLE IF NOT EXISTS "rh"."IndicadorNegocioAno" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "crescimentoClientesPct" DOUBLE PRECISION,
    "crescimentoFaturamentoPct" DOUBLE PRECISION,
    "observacao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPorId" TEXT,
    "atualizadoPorNome" TEXT,

    CONSTRAINT "IndicadorNegocioAno_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndicadorNegocioAno_grupoId_ano_key" ON "rh"."IndicadorNegocioAno"("grupoId", "ano");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConfiguracaoDesligamentos_grupoId_fkey'
  ) THEN
    ALTER TABLE "rh"."ConfiguracaoDesligamentos"
      ADD CONSTRAINT "ConfiguracaoDesligamentos_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IndicadorNegocioAno_grupoId_fkey'
  ) THEN
    ALTER TABLE "rh"."IndicadorNegocioAno"
      ADD CONSTRAINT "IndicadorNegocioAno_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES "rh"."Grupo"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
