-- Entregas ao colaborador: o que a empresa dá, e a confirmação de quem recebeu.
--
-- POR QUE UMA TABELA NOVA e não o EntregaEPI: aquela é a ficha da NR-06, com
-- CA e fabricante, e é o que a fiscalização do trabalho lê. Cartão de
-- benefício e notebook não são EPI — misturar poluiria um registro legal.
--
-- POR QUE NÃO BASTAVA O CHECKLIST DE ADMISSÃO: lá "Entrega do notebook" é uma
-- TAREFA marcada pelo RH. Aqui é INVENTÁRIO — o que a pessoa tem agora — e a
-- prova de que ela mesma confirmou. Ninguém respondia a segunda pergunta.
--
-- `confirmadoEm` nulo é o estado inicial: entregue, aguardando a pessoa
-- confirmar no portal. É essa coluna que a fila de cobrança lê.

CREATE TABLE IF NOT EXISTS "rh"."EntregaAoColaborador" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL,
  "colaboradorId"   TEXT NOT NULL,
  "tipo"            TEXT NOT NULL,
  "descricao"       TEXT,
  "quantidade"      INTEGER NOT NULL DEFAULT 1,
  "dataEntrega"     TIMESTAMP(3) NOT NULL,
  "observacoes"     TEXT,
  "confirmadoEm"    TIMESTAMP(3),
  "confirmadoIp"    TEXT,
  "devolvidoEm"     TIMESTAMP(3),
  "entreguePorId"   TEXT,
  "entreguePorNome" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntregaAoColaborador_pkey" PRIMARY KEY ("id")
);

-- CASCADE como no EntregaEPI: apagar o colaborador leva as entregas dele.
ALTER TABLE "rh"."EntregaAoColaborador"
  ADD CONSTRAINT "EntregaAoColaborador_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "EntregaAoColaborador_empresaId_tipo_idx"
  ON "rh"."EntregaAoColaborador"("empresaId", "tipo");
CREATE INDEX IF NOT EXISTS "EntregaAoColaborador_colaboradorId_idx"
  ON "rh"."EntregaAoColaborador"("colaboradorId");
-- A fila "quem ainda não confirmou" é lida a cada abertura da tela.
CREATE INDEX IF NOT EXISTS "EntregaAoColaborador_empresaId_confirmadoEm_idx"
  ON "rh"."EntregaAoColaborador"("empresaId", "confirmadoEm");
