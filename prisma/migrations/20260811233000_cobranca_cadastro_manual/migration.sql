-- Cobrança de cadastro disparada à mão pelo RH, pela tela — antes só o cron
-- cobrava. A linha do histórico passa a dizer se foi o robô ou uma pessoa, e
-- qual pessoa.
--
-- `manual` existe para SEPARAR as duas contagens, não como enfeite de
-- relatório: o motor automático conta só as linhas com manual = false para
-- decidir o teto de cobranças e a data da última. Sem essa separação, cobrar
-- alguém à mão encurtaria a campanha automática dele e adiaria a próxima
-- rodada — o oposto do que quem clicou quis dizer.
--
-- DEFAULT false cobre as linhas já gravadas: até aqui, toda cobrança saiu do
-- cron. O default fica na coluna porque o Prisma o declara em `@default(false)`
-- — schema e banco têm que continuar iguais.
--
-- Puramente ADITIVA: duas colunas com default/nulo, sem tocar em dado existente.
ALTER TABLE "rh"."CobrancaCadastro" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rh"."CobrancaCadastro" ADD COLUMN "solicitadaPorNome" TEXT;
