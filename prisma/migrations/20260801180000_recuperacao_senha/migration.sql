-- "Esqueci minha senha": mesmo padrão do convite (conviteTokenHash /
-- conviteExpiraEm) — só o hash do token fica no banco.
ALTER TABLE "rh"."User" ADD COLUMN "recuperacaoSenhaExpiraEm" TIMESTAMP(3);
ALTER TABLE "rh"."User" ADD COLUMN "recuperacaoSenhaTokenHash" TEXT;
