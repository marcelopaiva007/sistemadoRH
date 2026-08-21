-- Solicitações de ponto abertas pelo PRÓPRIO colaborador (21/08/2026, pedido
-- do RH): ajuste de marcação (não conseguiu bater — celular, internet, GPS) e
-- abono em dia de folga. Reaproveitam o TratamentoPonto, que já tem fila
-- PENDENTE, decisão auditada do RH e contagem na área de Pendências.
--
-- `origem` nasce 'RH' em todas as linhas existentes de propósito: até aqui só
-- o RH abria tratamento, então o retrofit é fiel ao que aconteceu.
-- `tipoMarcacao`/`horaSolicitada` são só dos pedidos de ajuste do colaborador
-- ("deveria ter registrado a ENTRADA_1 às 08:02") — nulos em todo o resto.
ALTER TABLE "rh"."TratamentoPonto" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'RH';
ALTER TABLE "rh"."TratamentoPonto" ADD COLUMN "tipoMarcacao" TEXT;
ALTER TABLE "rh"."TratamentoPonto" ADD COLUMN "horaSolicitada" TEXT;
