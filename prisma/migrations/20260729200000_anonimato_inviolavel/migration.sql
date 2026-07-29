-- Garantia no nível do banco de dados de que respostas em pesquisas anônimas
-- nunca carregam colaboradorId. Mesmo escrita direta via SQL/Prisma Studio
-- não consegue vincular respondente à resposta em pesquisa anônima.
--
-- A regra de negócio vive em lib/actions/pesquisas-publico.ts (não grava
-- colaboradorId quando pesquisa.anonima=true), mas a proteção crítica fica
-- aqui: nem backup malicioso nem bug futuro pode conectar pessoa e resposta.

ALTER TABLE rh."Resposta"
ADD CONSTRAINT resposta_anonima_sem_colaborador
CHECK (
  (SELECT "anonima" FROM rh."Pesquisa" WHERE id = "pesquisaId") = false
  OR "colaboradorId" IS NULL
);
