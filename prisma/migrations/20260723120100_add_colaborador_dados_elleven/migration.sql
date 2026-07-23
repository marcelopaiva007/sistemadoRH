-- Dados complementares do colaborador importados do elleven (ERP):
-- cidade, data de nascimento e o "Cod Pessoa" do elleven (chave de re-sync).
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "dataNascimento" TIMESTAMP(3);
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "ellevenCodigo" TEXT;
