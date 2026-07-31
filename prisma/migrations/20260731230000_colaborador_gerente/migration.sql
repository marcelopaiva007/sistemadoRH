-- Quem avalia a equipe no ciclo de desempenho.
--
-- O organograma (`supervisorId`) responde "reporta a quem" e é o que existia
-- para montar as avaliações. Só que aqui quem avalia é o gerente, não o
-- supervisor direto — e em três empresas o organograma está vazio, o que
-- deixaria todo mundo de fora do ciclo. Este campo separa as duas coisas: o
-- RH marca os gerentes, e cada um monta a própria lista de avaliados no portal.
ALTER TABLE "rh"."Colaborador" ADD COLUMN "gerente" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Colaborador_empresaId_gerente_idx" ON "rh"."Colaborador"("empresaId", "gerente");
