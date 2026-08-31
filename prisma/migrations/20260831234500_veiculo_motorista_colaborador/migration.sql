-- "Com quem está" busca o motorista no CADASTRO de colaboradores (pedido do
-- RH em 31/08/2026) — vínculo direto Veiculo → Colaborador, texto vira legado.
ALTER TABLE "rh"."Veiculo" ADD COLUMN "motoristaColaboradorId" TEXT;

ALTER TABLE "rh"."Veiculo" ADD CONSTRAINT "Veiculo_motoristaColaboradorId_fkey" FOREIGN KEY ("motoristaColaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
