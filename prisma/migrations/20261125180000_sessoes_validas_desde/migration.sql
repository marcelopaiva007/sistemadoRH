-- Sessões válidas desde (25/11/2026).
--
-- O login gravava papel, "ativo" e vínculos de empresa dentro do JWT e nunca
-- relia do banco: desativar a conta, tirar um CNPJ, rebaixar o papel ou
-- redefinir a senha não derrubava quem já estava logado (a sessão dura 30
-- dias). Agora o callback `jwt` relê o usuário a cada requisição, e sessão
-- aberta antes deste instante deixa de valer.
--
-- Nulo por padrão: nenhuma conta existente é deslogada por esta migration.
-- Idempotente como as demais.

ALTER TABLE "rh"."User" ADD COLUMN IF NOT EXISTS "sessoesValidasDesde" TIMESTAMP(3);
