-- Fase 3 — EPIs e ficha de entrega (NR-06).
--
-- Aditiva: só cria uma tabela nova no schema `rh`. Roda com o app no ar.
-- Reaplicável (IF NOT EXISTS / guardas), como as demais deste projeto.
--
-- `ca` é o Certificado de Aprovação do ITEM (capacete, cinto, luva...), não da
-- pessoa. `validoAte` é a troca periódica do equipamento (ex.: protetor
-- auricular a cada 6 meses) — não confundir com a validade do CA junto ao
-- governo, que este cadastro não acompanha. `assinado` registra se o
-- colaborador confirmou o recebimento — a ficha assinada é o que a
-- fiscalização pede.

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."EntregaEPI" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ca" TEXT,
    "fabricante" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "validadeMeses" INTEGER,
    "validoAte" TIMESTAMP(3),
    "motivo" TEXT NOT NULL DEFAULT 'PRIMEIRA_ENTREGA',
    "assinado" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntregaEPI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EntregaEPI_arquivoId_key" ON "rh"."EntregaEPI"("arquivoId");
CREATE INDEX IF NOT EXISTS "EntregaEPI_colaboradorId_tipo_idx" ON "rh"."EntregaEPI"("colaboradorId", "tipo");
CREATE INDEX IF NOT EXISTS "EntregaEPI_empresaId_validoAte_idx" ON "rh"."EntregaEPI"("empresaId", "validoAte");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."EntregaEPI" ADD CONSTRAINT "EntregaEPI_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."EntregaEPI" ADD CONSTRAINT "EntregaEPI_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
