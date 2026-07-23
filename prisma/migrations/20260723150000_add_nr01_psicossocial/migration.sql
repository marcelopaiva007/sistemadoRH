-- Módulo NR-01 (avaliação de riscos psicossociais / PGR):
-- Pesquisa.modelo, campos NR-01 em Pergunta, sexo do colaborador (elleven) e
-- snapshots demográficos anônimos na Resposta.
ALTER TABLE "Pesquisa" ADD COLUMN IF NOT EXISTS "modelo" TEXT NOT NULL DEFAULT 'CLIMA';
ALTER TABLE "Pergunta" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "Pergunta" ADD COLUMN IF NOT EXISTS "dimensao" TEXT;
ALTER TABLE "Pergunta" ADD COLUMN IF NOT EXISTS "invertida" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "sexo" TEXT;
ALTER TABLE "Resposta" ADD COLUMN IF NOT EXISTS "sexoSnapshot" TEXT;
ALTER TABLE "Resposta" ADD COLUMN IF NOT EXISTS "faixaEtariaSnapshot" TEXT;
