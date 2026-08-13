-- O que o schema.prisma NÃO consegue dizer — para o banco de CI.
--
-- O banco do CI nasce de `prisma migrate diff --from-empty --to-schema`, que
-- gera o schema inteiro a partir do prisma/schema.prisma. Só que o repositório
-- tem regras escritas em SQL à mão dentro das migrations — índice parcial,
-- CHECK, sequence, trigger — e essas o Prisma não representa no schema. Sem
-- elas o banco de CI fica mais permissivo que o de produção, e foi exatamente
-- assim que este arquivo nasceu: em 12/08/2026, na primeira rodada dos smokes
-- em banco novo, smoke-metas e smoke-ciclo-pesquisa REPROVARAM — o CHECK do
-- alvo da meta e o índice de título único de rascunho não existiam.
--
-- MANUTENÇÃO. Ao criar uma migration com SQL manual desse tipo, copie o trecho
-- para cá com o caminho da migration de origem. A rede de segurança é a própria
-- bateria de smokes: regra de banco que faltar aqui reprova o smoke que a
-- exercita — como aconteceu na estreia.
--
-- Cada bloco é idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).

-- De prisma/migrations/20260727320000_matricula_automatica/migration.sql:
-- matrícula gerada por sequence própria, e única quando preenchida.
CREATE SEQUENCE IF NOT EXISTS "rh"."matricula_seq" START WITH 2000 INCREMENT BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_matricula_key"
  ON "rh"."Colaborador" (matricula)
  WHERE matricula IS NOT NULL;

-- De prisma/migrations/20260802150000_pesquisa_titulo_unico_por_marca/migration.sql:
-- título de pesquisa único por marca, mas SÓ entre rascunhos.
CREATE UNIQUE INDEX IF NOT EXISTS "Pesquisa_marcaId_titulo_key"
  ON "rh"."Pesquisa"("marcaId", "titulo")
  WHERE status = 'DRAFT';

-- De prisma/migrations/20260725240000_fase3_metas_pdi/migration.sql:
-- meta tem exatamente UM alvo — colaborador OU setor, nunca ambos nem nenhum.
DO $$
BEGIN
  ALTER TABLE "rh"."Meta" ADD CONSTRAINT "Meta_colaborador_xor_setor_check"
    CHECK (("colaboradorId" IS NOT NULL) != ("setorId" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- De prisma/migrations/20260729200000_anonimato_inviolavel/migration.sql:
-- resposta de pesquisa anônima nunca grava colaboradorId, venha de onde vier.
CREATE OR REPLACE FUNCTION rh.resposta_anonima_sem_colaborador()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."colaboradorId" IS NOT NULL
     AND (SELECT p."anonima" FROM rh."Pesquisa" p WHERE p.id = NEW."pesquisaId") THEN
    RAISE EXCEPTION
      'Pesquisa % e anonima: a resposta nao pode gravar colaboradorId.', NEW."pesquisaId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS resposta_anonima_sem_colaborador ON rh."Resposta";

CREATE TRIGGER resposta_anonima_sem_colaborador
  BEFORE INSERT OR UPDATE ON rh."Resposta"
  FOR EACH ROW
  EXECUTE FUNCTION rh.resposta_anonima_sem_colaborador();

-- De prisma/migrations/20260730120000_anonimato_ao_ligar/migration.sql:
-- ligar o anonimato de uma pesquisa apaga os vínculos das respostas já dadas.
CREATE OR REPLACE FUNCTION rh.pesquisa_anonimato_apaga_vinculos()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rh."Resposta"
  SET "colaboradorId" = NULL
  WHERE "pesquisaId" = NEW.id
    AND "colaboradorId" IS NOT NULL;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pesquisa_anonimato_apaga_vinculos ON rh."Pesquisa";

CREATE TRIGGER pesquisa_anonimato_apaga_vinculos
  AFTER UPDATE OF "anonima" ON rh."Pesquisa"
  FOR EACH ROW
  WHEN (NEW."anonima" IS TRUE AND OLD."anonima" IS NOT TRUE)
  EXECUTE FUNCTION rh.pesquisa_anonimato_apaga_vinculos();
