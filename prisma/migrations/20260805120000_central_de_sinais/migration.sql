-- Central de Sinais: alerta com estado — dono, prazo e desfecho.
--
-- Até aqui os detectores (lib/alertas.ts, lib/anomalias.ts) só avaliavam e
-- mandavam e-mail: sem "eu vi", sem "virou plano", sem motivo de descarte, o
-- mesmo aviso volta todo dia como novidade e o time aprende a ignorá-lo. Esta
-- tabela dá estado ao alerta: cada ocorrência vira UMA linha, com dono, prazo
-- e desfecho registrados.
--
-- Puramente ADITIVA: cria uma tabela nova e não toca em nenhuma existente.
CREATE TABLE "rh"."Sinal" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivelUnidade" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "unidadeNome" TEXT NOT NULL,
    "empresaId" TEXT,
    "chaveDedupe" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "observado" TEXT NOT NULL,
    "esperado" TEXT NOT NULL,
    "recorte" TEXT,
    "gravidade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "motivoDescarte" TEXT,
    "donoUserId" TEXT,
    "donoNome" TEXT,
    "prazo" TIMESTAMP(3),
    "planoAcaoId" TEXT,
    "silenciadoAte" TIMESTAMP(3),
    "detectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sinal_pkey" PRIMARY KEY ("id")
);

-- "Essa ocorrência já existe?" — a pergunta que o cron faz a cada candidato.
-- Índice simples, NÃO unique, de propósito: a mesma chave de dedupe volta a
-- existir quando um descarte envelhece (60 dias, lib/sinais.ts) e a situação
-- persiste — a unicidade do "vivo" é regra de aplicação, não do banco.
CREATE INDEX "Sinal_chaveDedupe_idx" ON "rh"."Sinal"("chaveDedupe");

-- "O que está aberto, por gravidade?" — a pergunta da tela da Central.
CREATE INDEX "Sinal_status_gravidade_idx" ON "rh"."Sinal"("status", "gravidade");

-- "Quantas vezes essa unidade já descartou esse tipo?" — a regra de silêncio
-- (2 descartes seguidos → próximo sinal nasce silenciado por 60 dias).
CREATE INDEX "Sinal_tipo_unidadeId_idx" ON "rh"."Sinal"("tipo", "unidadeId");

-- Não há FOREIGN KEY para User/PlanoAcao/Empresa de propósito: as referências
-- são SOFT (id + snapshot do nome onde há nome), o mesmo padrão da trilha de
-- auditoria e de PlanoAcao.responsavel* — um usuário excluído ou um setor
-- apagado dois anos depois não pode quebrar nem reescrever o histórico de
-- sinais.
