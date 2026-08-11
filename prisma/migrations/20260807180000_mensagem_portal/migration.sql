-- Fale com o RH: mensagem que o colaborador manda pelo portal.
--
-- O portal deixou de mostrar planejamento de férias (restrito à área interna)
-- e ganhou em troca um canal direto: dúvida, pedido ou aviso vira uma linha
-- aqui, o RH responde pela tela Mensagens e a resposta aparece de volta no
-- portal da pessoa.
--
-- Puramente ADITIVA: cria uma tabela nova e não toca em nenhuma existente.
CREATE TABLE "rh"."MensagemPortal" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "resposta" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "respondidaPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemPortal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MensagemPortal_empresaId_respondidaEm_idx" ON "rh"."MensagemPortal"("empresaId", "respondidaEm");

CREATE INDEX "MensagemPortal_colaboradorId_idx" ON "rh"."MensagemPortal"("colaboradorId");

ALTER TABLE "rh"."MensagemPortal" ADD CONSTRAINT "MensagemPortal_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
