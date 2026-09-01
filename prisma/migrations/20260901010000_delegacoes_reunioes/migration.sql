-- Reuniões nas Delegações (pedido da Direção em 31/08/2026): a reunião é o
-- AGRUPADOR dos convocados — cada convocado recebe uma demanda própria
-- (regra 1 do responsável único intacta), e a régua de cobrança existente faz
-- o lembrete. Puramente aditiva: tabela nova + coluna anulável na Demanda,
-- nenhum dado tocado.

CREATE TABLE "rh"."Reuniao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "pauta" TEXT,
    "local" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reuniao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reuniao_solicitanteId_dataHora_idx" ON "rh"."Reuniao"("solicitanteId", "dataHora");

ALTER TABLE "rh"."Reuniao" ADD CONSTRAINT "Reuniao_solicitanteId_fkey"
    FOREIGN KEY ("solicitanteId") REFERENCES "rh"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh"."Demanda" ADD COLUMN "reuniaoId" TEXT;

ALTER TABLE "rh"."Demanda" ADD CONSTRAINT "Demanda_reuniaoId_fkey"
    FOREIGN KEY ("reuniaoId") REFERENCES "rh"."Reuniao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
