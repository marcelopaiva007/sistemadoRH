-- Liga DocumentoVeiculo.arquivoId ao Arquivo — o anexo do CRLV/licenciamento/
-- apólice do veículo (pedido do RH em 27/08/2026).
--
-- A coluna `arquivoId` já existia desde a criação do módulo, mas SOLTA: sem
-- índice, sem chave estrangeira, e nenhuma action do sistema jamais escreveu
-- nela. Conferido antes de rodar: 0 linhas em DocumentoVeiculo, 0 valores em
-- arquivoId — nada a migrar, nada que possa violar a restrição nova.
--
-- SetNull, não Cascade: apagar o arquivo NÃO pode apagar o documento. É o
-- documento que carrega a data de vencimento que alimenta o alerta — perder a
-- linha junto com o PDF apagaria o prazo em silêncio. Mesma escolha do dossiê
-- do colaborador (DocumentoColaborador_arquivoId_fkey).
CREATE UNIQUE INDEX "DocumentoVeiculo_arquivoId_key" ON "rh"."DocumentoVeiculo"("arquivoId");

ALTER TABLE "rh"."DocumentoVeiculo"
  ADD CONSTRAINT "DocumentoVeiculo_arquivoId_fkey"
  FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
