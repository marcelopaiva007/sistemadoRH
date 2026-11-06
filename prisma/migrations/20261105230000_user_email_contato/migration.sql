-- O E-MAIL DEIXA DE IDENTIFICAR A CONTA (v1.191.0, decisão do CEO em
-- 05/11/2026).
--
-- O acesso passou a ser só pelo nome de usuário, e cada usuário pertence a UM
-- grupo (a LM Telecom ou as demais marcas). Quem trabalha nos dois tem dois
-- usuários — "marcelo" e "marcelo.lm", por exemplo — e os dois recebem no
-- mesmo e-mail. Com o índice único, o segundo usuário não podia ter o e-mail
-- da pessoa. O e-mail vira contato: avisos e os links de "Esqueci minha
-- senha" / "Esqueci meu usuário".
--
-- O índice comum fica para o "Esqueci meu usuário", que busca por e-mail.
-- Nenhum dado muda. Idempotente como as demais.
DROP INDEX IF EXISTS "rh"."User_email_key";
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "rh"."User"("email");
