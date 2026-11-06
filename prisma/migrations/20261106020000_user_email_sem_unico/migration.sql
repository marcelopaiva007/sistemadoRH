-- REDE DE SEGURANÇA DA 20261105230000_user_email_contato (revisão da v1.191.0).
--
-- Aquela migration derruba o índice único pelo NOME que o Prisma dá a ele
-- ("User_email_key"), com IF EXISTS. Parte do histórico deste banco foi
-- aplicada à mão (ver prisma/checar-migracoes.mjs); se a unicidade do e-mail
-- tiver nascido com outro nome — ou como restrição UNIQUE, ou sobre
-- lower(email) —, o DROP não faz nada, calado, e o segundo usuário da mesma
-- pessoa (o "marcelo.lm" com o e-mail do "marcelo") não pode ser criado.
--
-- Aqui se procura pelo QUE a unicidade é, não pelo nome: toda restrição
-- UNIQUE e todo índice único de "rh"."User" sobre email (ou lower(email))
-- sai. Os demais (username, colaboradorId, a chave primária) ficam. Rodar de
-- novo não faz nada. Nenhum dado muda.
DO $$
DECLARE
  r record;
BEGIN
  -- Restrições UNIQUE de uma coluna só, a coluna email.
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    WHERE n.nspname = 'rh'
      AND t.relname = 'User'
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'email'
  LOOP
    EXECUTE format('ALTER TABLE "rh"."User" DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- Índices únicos soltos (sem restrição por trás) sobre email ou lower(email).
  FOR r IN
    SELECT i.relname AS indice
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'rh'
      AND t.relname = 'User'
      AND x.indisunique
      AND NOT x.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
      AND pg_get_indexdef(x.indexrelid) ~* '\(\s*(lower\(\s*)?"?email"?\s*\)?\s*\)\s*$'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS "rh".%I', r.indice);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS "User_email_idx" ON "rh"."User"("email");
