-- Prazos eSocial (26/11/2026): a marcação de "enviado ao escritório" de cada
-- evento (S-2200, S-2299, S-2210, S-2230). O sistema não transmite ao eSocial;
-- esta tabela só guarda que os dados do evento já foram para o escritório
-- contábil — é o que tira o prazo da tela de Pendências.
--
-- Só tabela nova — nada existente muda. Idempotente como as demais.

CREATE TABLE IF NOT EXISTS "rh"."EventoEsocialEnvio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoPorId" TEXT,
    "enviadoPorNome" TEXT,
    "observacao" TEXT,

    CONSTRAINT "EventoEsocialEnvio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventoEsocialEnvio_tipo_referenciaId_key" ON "rh"."EventoEsocialEnvio"("tipo", "referenciaId");
CREATE INDEX IF NOT EXISTS "EventoEsocialEnvio_empresaId_idx" ON "rh"."EventoEsocialEnvio"("empresaId");
