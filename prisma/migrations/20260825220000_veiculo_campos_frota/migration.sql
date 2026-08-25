-- Campos da planilha de frota da L&M que faltavam no cadastro de veículo
-- (25/08/2026). Decisão do dono do sistema: todas as colunas da planilha têm
-- que ter campo no cadastro. Puramente aditiva — 4 colunas anuláveis (uma com
-- default), nenhuma tabela existente muda de forma, nenhum dado é tocado.
ALTER TABLE "rh"."Veiculo" ADD COLUMN "cidadeBase" TEXT;
ALTER TABLE "rh"."Veiculo" ADD COLUMN "setor" TEXT;
ALTER TABLE "rh"."Veiculo" ADD COLUMN "emplacado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rh"."Veiculo" ADD COLUMN "motoristaInformado" TEXT;
