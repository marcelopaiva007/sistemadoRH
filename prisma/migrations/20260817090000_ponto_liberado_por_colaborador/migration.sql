-- Liberação individual do ponto eletrônico. Nasce `false` em todas as linhas
-- de propósito: até aqui todo colaborador ativo batia ponto sem nenhum
-- controle por pessoa. A partir desta migration, o RH liga cada um
-- manualmente na aba "Colaboradores" de Ponto Eletrônico.
ALTER TABLE "rh"."Colaborador" ADD COLUMN "pontoLiberado" BOOLEAN NOT NULL DEFAULT false;
