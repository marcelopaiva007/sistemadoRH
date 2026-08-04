-- Data de término do contrato por prazo determinado.
--
-- `tipoContrato` já distinguia EXPERIENCIA, TEMPORARIO e ESTAGIO de CLT, mas
-- não havia onde guardar QUANDO esse prazo acaba — e sem isso o vencimento não
-- é observável por ninguém. A consequência não é cosmética: contrato de
-- experiência que passa do termo sem ação vira contrato por prazo
-- indeterminado por força da CLT (art. 445 e 451), com aviso prévio, multa de
-- FGTS e estabilidade que a empresa não tinha contratado.
--
-- Opcional de propósito: 219 colaboradores ativos estão com `tipoContrato`
-- nulo, e a ficha vai sendo completada aos poucos. NOT NULL aqui reprovaria a
-- migration na primeira linha.
ALTER TABLE "rh"."Colaborador" ADD COLUMN "dataFimContrato" TIMESTAMP(3);

-- A pendência pergunta "quem vence nos próximos N dias, nesta empresa" —
-- exatamente a forma deste índice.
CREATE INDEX "Colaborador_empresaId_dataFimContrato_idx"
  ON "rh"."Colaborador"("empresaId", "dataFimContrato");
