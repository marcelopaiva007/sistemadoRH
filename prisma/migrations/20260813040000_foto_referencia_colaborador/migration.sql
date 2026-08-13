-- Foto de referência do colaborador: o rosto contra o qual o RH compara a
-- selfie de cada batida de ponto.
--
-- Nasce nula em todas as linhas. Ela se preenche de dois jeitos, e o segundo
-- campo diz qual foi: a promoção automática da primeira selfie de batida
-- (fotoConferidaPeloRh = false, imediata mas sem ninguém ter olhado) ou o
-- envio/confirmação por uma pessoa do RH (true).
ALTER TABLE "rh"."Colaborador" ADD COLUMN "fotoUrl" TEXT;

ALTER TABLE "rh"."Colaborador"
  ADD COLUMN "fotoConferidaPeloRh" BOOLEAN NOT NULL DEFAULT false;
