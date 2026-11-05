-- Conta de ADMIN (papel MASTER) — a "tela de admin" pedida pelo CEO em
-- 05/11/2026: quem decide, conta a conta, o grupo e as marcas que cada login
-- vê (lib/actions/usuarios.ts, `definirMarcasQueVe`).
--
-- Cria o login "master" SÓ se ainda não existe MASTER nenhum — quem já criou o
-- seu com scripts/criar-master.ts não ganha um segundo. Idempotente como as
-- demais: rodar de novo não faz nada.
--
-- SEM SENHA UTILIZÁVEL, de propósito: o hash abaixo não é bcrypt, e o login
-- trata hash malformado como senha errada (auth.ts). O CEO define a senha pelo
-- "Esqueci minha senha", com o link que chega no e-mail desta conta — a senha
-- nunca passa por código, deploy ou conversa, mesma regra do script.
--
-- O e-mail é o do login "marcelo" (o CEO) com "+admin" antes do @: o Gmail
-- entrega na mesma caixa, e `User.email` é único — o endereço puro já é da
-- conta de Diretoria dele. Nenhum endereço fica escrito neste repositório.
INSERT INTO "rh"."User" (id, nome, username, "passwordHash", role, ativo, "grupoId", email, "createdAt")
SELECT
  'master_' || md5(random()::text || clock_timestamp()::text),
  'Admin (Master)',
  'master',
  '!sem-senha: definir pelo Esqueci minha senha',
  'MASTER',
  true,
  NULL,
  regexp_replace(u.email, '@', '+admin@'),
  now()
FROM "rh"."User" u
WHERE u.username = 'marcelo'
  AND u.email IS NOT NULL
  AND position('@' in u.email) > 0
  AND NOT EXISTS (SELECT 1 FROM "rh"."User" WHERE role = 'MASTER')
  AND NOT EXISTS (SELECT 1 FROM "rh"."User" WHERE username = 'master')
  AND NOT EXISTS (
    SELECT 1 FROM "rh"."User" x
    WHERE lower(x.email) = lower(regexp_replace(u.email, '@', '+admin@'))
  );
