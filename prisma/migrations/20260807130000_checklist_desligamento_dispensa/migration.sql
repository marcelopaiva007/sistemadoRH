-- Dispensa do checklist de offboarding para desligamento antigo.
--
-- 105 desligados não têm nenhuma linha em ChecklistDesligamento (checklist
-- nunca foi gerado) — a maioria saiu antes do sistema existir, e cobrar
-- devolução de crachá/notebook/EPI de quem já foi embora há meses ou anos não
-- tem como ser cumprido. A dispensa marca isso explicitamente (quem dispensou
-- e quando), em vez de gerar o checklist padrão com os 11 itens já marcados
-- como conferidos — o que registraria uma devolução que não aconteceu.
ALTER TABLE "rh"."Colaborador" ADD COLUMN "checklistDispensado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rh"."Colaborador" ADD COLUMN "checklistDispensadoEm" TIMESTAMP(3);
ALTER TABLE "rh"."Colaborador" ADD COLUMN "checklistDispensadoPorId" TEXT;
ALTER TABLE "rh"."Colaborador" ADD COLUMN "checklistDispensadoPorNome" TEXT;
