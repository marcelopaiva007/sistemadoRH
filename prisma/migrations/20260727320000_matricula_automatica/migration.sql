-- Matrícula automática do colaborador, a partir de 2000.
--
-- Sequence em vez de MAX(matricula)+1: dois cadastros simultâneos (o RH numa
-- aba, a importação em lote na outra) leriam o mesmo máximo e gerariam a mesma
-- matrícula. `nextval` é atômico e nunca repete, mesmo em transação que dá
-- rollback — matrícula pulada é irrelevante, matrícula duplicada não.
--
-- Numeração única no grupo inteiro, não por empresa: a mesma pessoa pode migrar
-- de CNPJ dentro do grupo (11 razões sociais para 3 marcas) e a matrícula
-- precisa continuar sendo dela.
--
-- Os 273 já cadastrados são numerados por ordem de admissão — quem entrou
-- primeiro tem o número menor, que é o que se espera de matrícula.

CREATE SEQUENCE IF NOT EXISTS "rh"."matricula_seq" START WITH 2000 INCREMENT BY 1;

-- Carga inicial: mais antigo primeiro; sem data de admissão vai para o fim,
-- em ordem alfabética, para o resultado não depender da ordem física da tabela.
WITH ordenados AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY "dataAdmissao" ASC NULLS LAST, nome ASC
         ) - 1 AS pos
  FROM "rh"."Colaborador"
  WHERE matricula IS NULL
)
UPDATE "rh"."Colaborador" c
   SET matricula = (2000 + o.pos)::text
  FROM ordenados o
 WHERE c.id = o.id;

-- Deixa a sequence acima do maior número já usado.
SELECT setval('"rh"."matricula_seq"',
              GREATEST(2000, COALESCE((SELECT MAX(matricula::bigint)
                                         FROM "rh"."Colaborador"
                                        WHERE matricula ~ '^[0-9]+$'), 1999) + 1),
              false);

-- Duas pessoas com a mesma matrícula é sempre erro. Parcial porque a coluna
-- aceita nulo — colaborador importado antes da numeração não trava o índice.
CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_matricula_key"
  ON "rh"."Colaborador" (matricula)
  WHERE matricula IS NOT NULL;
