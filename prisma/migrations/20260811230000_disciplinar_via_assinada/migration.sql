-- Medida disciplinar: onde guardar a VIA ASSINADA, digitalizada.
--
-- O sistema já gerava o documento em branco (v1.67.0) e já registrava
-- `statusAssinatura` = ASSINADO | RECUSADO_COM_TESTEMUNHAS. Faltava o meio do
-- caminho: depois de imprimir, colher a assinatura e escanear, não havia onde
-- guardar o papel. Ele ficava na pasta física, e o sistema afirmava que a
-- assinatura existia sem poder mostrá-la.
--
-- Numa reclamatória trabalhista o que se pede é o documento assinado. Status
-- é afirmação; o anexo é a prova.

ALTER TABLE "rh"."OcorrenciaDisciplinar" ADD COLUMN "arquivoId" TEXT;

-- `UNIQUE` e não índice comum: a relação com Arquivo é 1-para-1, igual às
-- outras oito do mesmo modelo (Ausencia, CertificadoNR, EntregaEPI...). Sem
-- isto o Prisma não aceita `arquivo Arquivo?` do lado da ocorrência.
CREATE UNIQUE INDEX "OcorrenciaDisciplinar_arquivoId_key"
  ON "rh"."OcorrenciaDisciplinar"("arquivoId");

-- ON DELETE SET NULL: apagar o anexo não pode apagar a ocorrência. A medida
-- disciplinar em si é o registro que precisa sobreviver — perder a advertência
-- inteira porque alguém removeu um PDF seria destruir histórico.
ALTER TABLE "rh"."OcorrenciaDisciplinar"
  ADD CONSTRAINT "OcorrenciaDisciplinar_arquivoId_fkey"
  FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
