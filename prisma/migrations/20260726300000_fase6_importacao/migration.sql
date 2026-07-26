-- Fase 6, etapa C — histórico de importações em massa.
-- Só o resumo (contagens e autor), nunca o conteúdo da planilha: o arquivo
-- pode carregar CPF e salário, e copiá-lo para cá criaria uma segunda base de
-- dado pessoal fora da ficha.

CREATE TABLE "rh"."ImportacaoArquivo" (
  "id"            TEXT NOT NULL,
  "empresaId"     TEXT NOT NULL,
  "arquivoNome"   TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "totalLinhas"   INTEGER NOT NULL,
  "criados"       INTEGER NOT NULL,
  "atualizados"   INTEGER NOT NULL,
  "comErro"       INTEGER NOT NULL,
  "criadoPorId"   TEXT,
  "criadoPorNome" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportacaoArquivo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportacaoArquivo_empresaId_createdAt_idx"
  ON "rh"."ImportacaoArquivo"("empresaId", "createdAt");
