-- Tratamento de Ponto (PTRP): motivo da decisão em coluna própria + índice da fila
--
-- Até 11/08/2026 o motivo da rejeição era CONCATENADO dentro de `motivo`, que
-- é o texto de quem PEDIU o ajuste:
--
--   `${atual.motivo}\n\n[Rejeitado por Fulano] ${motivoDecisao}`
--
-- Duas coisas erradas nisso, num módulo que existe por exigência legal
-- (Portaria MTP 671/2021): o registro do solicitante era reescrito por quem o
-- julgou, e o "[Rejeitado por Fulano]" era texto livre — qualquer pessoa com
-- acesso ao campo podia digitar a mesma marca à mão. Agora a decisão tem
-- coluna própria e o pedido original fica intacto.

ALTER TABLE "rh"."TratamentoPonto" ADD COLUMN "motivoDecisao" TEXT;

-- A fila de pendentes é lida a cada abertura da tela de Ponto e da Central de
-- Aprovações, sempre por empresa + status. Os índices existentes são por
-- dataFato e não servem a esse filtro.
CREATE INDEX "TratamentoPonto_empresaId_status_idx" ON "rh"."TratamentoPonto"("empresaId", "status");

-- Recupera o que dá para recuperar das rejeições já gravadas: onde o texto
-- carrega a marca "[Rejeitado por ...]", a parte após o `]` vai para a coluna
-- nova e `motivo` volta a ser só o pedido original.
--
-- NÃO é um `UPDATE` cego: o filtro exige status REJEITADO **e** a marca
-- presente. Linha sem a marca (rejeição anterior ao formato, ou motivo em que
-- o solicitante escreveu esse texto por conta própria) fica como está — nesses
-- casos não há como separar pedido de decisão sem inventar, e inventar num
-- registro fiscalizável é pior que deixar a costura à vista.
UPDATE "rh"."TratamentoPonto"
SET
  "motivoDecisao" = substring("motivo" from position(']' in substring("motivo" from position('[Rejeitado por ' in "motivo"))) + position('[Rejeitado por ' in "motivo")),
  "motivo"        = rtrim(substring("motivo" from 1 for position('[Rejeitado por ' in "motivo") - 1))
WHERE "status" = 'REJEITADO'
  AND position('[Rejeitado por ' in "motivo") > 0;
