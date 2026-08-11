-- Complemento de 20260729200000_anonimato_inviolavel.
--
-- Aquela migration cobre escrita em Resposta: nenhuma resposta nasce nem é
-- alterada com colaboradorId quando a Pesquisa é anônima. Só que o trigger vive
-- em Resposta, e ninguém o consulta quando quem muda é a Pesquisa. Virar
-- `anonima` de false para true numa pesquisa que já coletou respostas
-- identificadas deixava os vínculos antigos de pé: a tela passava a dizer
-- "anônima" com o colaboradorId ainda gravado na linha. Pior tipo de falha de
-- privacidade — a que se anuncia resolvida.
--
-- Verificado em produção antes de aplicar: 0 pesquisas nessa situação (as duas
-- existentes já nascem anônimas, 247 respostas, nenhuma vinculada).
--
-- Pelo app o caminho está fechado: updatePesquisa não escreve mais `anonima`
-- (lib/actions/pesquisas.ts). Mas a premissa desta dupla de migrations é não
-- confiar só na aplicação — restore, Prisma Studio e SQL direto continuam
-- alcançando a coluna. Ligar o anonimato apaga o vínculo junto, sempre.

-- Higieniza o que já existe. Hoje é no-op; serve para ambiente com dado sujo.
UPDATE rh."Resposta" r
SET "colaboradorId" = NULL
FROM rh."Pesquisa" p
WHERE p.id = r."pesquisaId"
  AND p."anonima" = true
  AND r."colaboradorId" IS NOT NULL;

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

-- Só no sentido false -> true. Tirar o anonimato não ressuscita vínculo nenhum
-- (o dado não existe mais), e não é papel do banco autorizar essa troca.
CREATE TRIGGER pesquisa_anonimato_apaga_vinculos
  AFTER UPDATE OF "anonima" ON rh."Pesquisa"
  FOR EACH ROW
  WHEN (NEW."anonima" IS TRUE AND OLD."anonima" IS NOT TRUE)
  EXECUTE FUNCTION rh.pesquisa_anonimato_apaga_vinculos();
