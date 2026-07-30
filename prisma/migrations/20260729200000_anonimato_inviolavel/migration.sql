-- Garantia no nível do banco de dados de que respostas em pesquisas anônimas
-- nunca carregam colaboradorId. Mesmo escrita direta via SQL/Prisma Studio
-- não consegue vincular respondente à resposta em pesquisa anônima.
--
-- A regra de negócio vive em lib/actions/pesquisas-publico.ts (não grava
-- colaboradorId quando pesquisa.anonima=true), mas a proteção crítica fica
-- aqui: nem backup malicioso nem bug futuro pode conectar pessoa e resposta.
--
-- Por que TRIGGER e não CHECK: a primeira versão desta migration usava
--   CHECK ((SELECT anonima FROM Pesquisa WHERE ...) = false OR colaboradorId IS NULL)
-- e o PostgreSQL recusa — "cannot use subquery in check constraint" (0A000).
-- CHECK enxerga só a própria linha, e a regra depende da Pesquisa. Por isso ela
-- nunca chegou a ser aplicada em ambiente nenhum: ficou dois dias parecendo uma
-- garantia que não existia. Um trigger BEFORE alcança a outra tabela e dá a
-- garantia de verdade — a escrita é recusada, venha de onde vier.

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
