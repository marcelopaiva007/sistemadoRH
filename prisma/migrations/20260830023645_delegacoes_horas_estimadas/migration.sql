-- Horas estimadas por demanda (pedido do CEO em 29/08/2026): quanto esforço
-- se esperava que a demanda levasse para concluir, sugerido pela IA ao
-- redigir e editável antes de enviar. PLANEJAMENTO, não medição — o sistema
-- segue sem apontamento de horas trabalhadas.
--
-- Puramente aditiva — coluna anulável, nenhuma tabela existente muda de
-- forma, nenhum dado é tocado.
ALTER TABLE "rh"."Demanda" ADD COLUMN "horasEstimadas" DOUBLE PRECISION;
