-- Fecha o ciclo do reajuste de contrato (24/08/2026).
--
-- PURAMENTE ADITIVA: uma coluna nova, anulável, em `rh.Contrato`. Nenhuma
-- tabela existente muda de forma, nenhum dado é tocado, nenhum backfill é
-- necessário — NULL significa "nunca reajustado", que é a verdade para todos
-- os contratos já cadastrados.
--
-- POR QUE ELA EXISTE: `proximoReajuste` é uma data materializada, gravada ao
-- salvar o contrato. Sem um registro de que o reajuste foi APLICADO, nada no
-- sistema jamais avançava essa data — passado o mês-base, a pendência
-- REAJUSTE_CONTRATO ficava vencida para sempre, e a única saída do usuário
-- era dispensá-la, o que desligava o alerta de reajuste daquele contrato em
-- definitivo. Um alerta anual cuja única saída é o silêncio permanente é pior
-- que alerta nenhum: ele treina o time a dispensar.
--
-- Com a coluna, "Aplicar reajuste" carimba a data e recalcula o próximo ciclo
-- a partir dela — a pendência fecha sozinha e volta no ano seguinte.

-- AlterTable
ALTER TABLE "rh"."Contrato" ADD COLUMN "ultimoReajusteEm" TIMESTAMP(3);
