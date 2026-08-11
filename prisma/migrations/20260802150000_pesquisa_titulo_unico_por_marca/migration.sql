-- Título de pesquisa único por marca ENQUANTO RASCUNHO.
--
-- Em 31/07/2026 às 12:00 UTC uma execução do cron gestao-ciclo-pesquisas
-- (ainda com o laço por CNPJ) criou um "Pulso de Clima 2026 T3" para cada
-- empresa, e o RH apagou os excedentes à mão. O laço por CNPJ acabou com a
-- pesquisa por marca (20260801140000), e o cron agora re-checa dentro da
-- transação antes de criar (lib/pesquisa-ciclo.ts) — este índice é a garantia
-- no banco: mesmo que uma nova rota de criação esqueça a checagem, o rascunho
-- não duplica.
--
-- PARCIAL (WHERE status = 'DRAFT') de propósito. A duplicata do incidente é
-- sempre rascunho contra rascunho — é assim que todo ciclo automático nasce.
-- Um UNIQUE cheio quebraria as campanhas permanentes por evento (P06-ONB30
-- "Onboarding — 30 dias", P09-OFF "Pesquisa de Desligamento"): elas nascem
-- ACTIVE com título fixo e `garantirCampanha` recria com o MESMO título
-- quando a anterior é encerrada — a FINISHED segura o título para sempre e a
-- recriação estouraria P2002 dentro do gatilho de desligar colaborador.
--
-- Índice parcial não existe no schema.prisma (o Prisma não representa);
-- documentado no comentário do model Pesquisa. Nome no padrão do Prisma.
-- O DROP cobre quem chegou a receber a versão cheia deste índice.
DROP INDEX IF EXISTS "rh"."Pesquisa_marcaId_titulo_key";
CREATE UNIQUE INDEX "Pesquisa_marcaId_titulo_key"
  ON "rh"."Pesquisa"("marcaId", "titulo")
  WHERE status = 'DRAFT';
