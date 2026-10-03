-- Caixa de documentos (v1.179.0, 28/09/2026).
--
-- O RH solta de uma vez os PDFs que chegam do contador (contracheques, ASOs,
-- atestados, certificados...). A IA lê cada arquivo, acha cada documento de
-- cada pessoa lá dentro e encaminha para o lugar certo: ASO vira exame
-- ocupacional, atestado vira ausência, contracheque vai para o dossiê (e
-- aparece no portal da pessoa). O que ela não tem certeza fica numa fila de
-- conferência, resolvida com um clique.
--
-- DocumentoRecebido = UM arquivo enviado. O original fica só enquanto há algo
-- a resolver; depois é apagado e restam as fatias por pessoa, cada uma no seu
-- destino. `empresasEscopo` congela os CNPJs que quem enviou enxergava: é o
-- único conjunto de fichas em que o arquivo pode ser gravado.
-- ItemDocumentoRecebido = UM documento de UMA pessoa achado nesse arquivo,
-- com o que foi lido e para onde foi.
--
-- DocumentoColaborador.competencia e chaveDedupe: o mês de referência do
-- contracheque e a chave de "mesmo documento" (índice único parcial no fim).
--
-- Migração só ADITIVA: duas tabelas novas e duas colunas que nascem nulas.

-- AlterTable
ALTER TABLE "rh"."DocumentoColaborador" ADD COLUMN IF NOT EXISTS "chaveDedupe" TEXT,
ADD COLUMN IF NOT EXISTS "competencia" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."DocumentoRecebido" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "empresasEscopo" TEXT[],
    "arquivoId" TEXT,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "paginas" INTEGER,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_UPLOAD',
    "proximaPagina" INTEGER NOT NULL DEFAULT 1,
    "tamanhoBloco" INTEGER NOT NULL DEFAULT 8,
    "processandoDesde" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "resumoIa" TEXT,
    "inventarioPaginas" JSONB,
    "modeloIa" TEXT,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoRecebido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."ItemDocumentoRecebido" (
    "id" TEXT NOT NULL,
    "recebidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "paginaInicio" INTEGER NOT NULL,
    "paginaFim" INTEGER NOT NULL,
    "nomeLido" TEXT,
    "cpfLido" TEXT,
    "pisLido" TEXT,
    "cnpjLido" TEXT,
    "dados" JSONB NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL,
    "colaboradorId" TEXT,
    "chaveMatch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "destinoEntidade" TEXT,
    "destinoId" TEXT,
    "resolvidoPorNome" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemDocumentoRecebido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoRecebido_arquivoId_key" ON "rh"."DocumentoRecebido"("arquivoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentoRecebido_empresaId_status_idx" ON "rh"."DocumentoRecebido"("empresaId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentoRecebido_empresaId_hash_idx" ON "rh"."DocumentoRecebido"("empresaId", "hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemDocumentoRecebido_status_idx" ON "rh"."ItemDocumentoRecebido"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemDocumentoRecebido_colaboradorId_idx" ON "rh"."ItemDocumentoRecebido"("colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ItemDocumentoRecebido_recebidoId_ordem_key" ON "rh"."ItemDocumentoRecebido"("recebidoId", "ordem");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentoColaborador_colaboradorId_tipo_competencia_idx" ON "rh"."DocumentoColaborador"("colaboradorId", "tipo", "competencia");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rh"."DocumentoRecebido" ADD CONSTRAINT "DocumentoRecebido_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rh"."ItemDocumentoRecebido" ADD CONSTRAINT "ItemDocumentoRecebido_recebidoId_fkey" FOREIGN KEY ("recebidoId") REFERENCES "rh"."DocumentoRecebido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "rh"."ItemDocumentoRecebido" ADD CONSTRAINT "ItemDocumentoRecebido_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- Contracheque, informe, TRCT e recibo de férias entram UMA vez por pessoa: o
-- contador reenviar a mesma folha não duplica nada. Parcial porque o resto do
-- Dossiê (RG, CNH...) não tem chave. Copiado em scripts/ci-extras-banco.sql —
-- o banco de CI nasce do schema.prisma, que não expressa índice parcial.
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoColaborador_colaboradorId_chaveDedupe_key"
  ON "rh"."DocumentoColaborador"("colaboradorId", "chaveDedupe")
  WHERE "chaveDedupe" IS NOT NULL;
