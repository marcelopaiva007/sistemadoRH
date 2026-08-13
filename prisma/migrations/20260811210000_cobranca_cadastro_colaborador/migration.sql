-- Cobrança de cadastro do colaborador pelo Telegram: o registro de quem já foi
-- cobrado, quando e do quê (lib/cobranca-cadastro-colaborador.ts).
--
-- Sem esta tabela o cron não tem relógio: mandaria a mesma mensagem para a
-- mesma pessoa todo dia, que é o caminho curto para o colaborador bloquear o
-- bot e o RH perder o canal inteiro, não só esta cobrança.
--
-- Puramente ADITIVA: cria uma tabela nova e não toca em nenhuma existente.
CREATE TABLE "rh"."CobrancaCadastro" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL,
    "itens" TEXT NOT NULL,
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CobrancaCadastro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CobrancaCadastro_colaboradorId_enviadaEm_idx" ON "rh"."CobrancaCadastro"("colaboradorId", "enviadaEm");

CREATE INDEX "CobrancaCadastro_empresaId_enviadaEm_idx" ON "rh"."CobrancaCadastro"("empresaId", "enviadaEm");

ALTER TABLE "rh"."CobrancaCadastro" ADD CONSTRAINT "CobrancaCadastro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
