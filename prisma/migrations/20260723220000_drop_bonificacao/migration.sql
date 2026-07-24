-- Remove as tabelas do antigo módulo de bonificação de vendas.
--
-- O código que as usava saiu do repositório em 23/07/2026 (commits b599d18,
-- 0c2a11d, 9f94b37) quando o app virou exclusivamente Sistema do RH; estas
-- tabelas ficaram órfãs no banco desde então. Nenhum model do schema, server
-- action, rota ou script referencia qualquer uma delas.
--
-- ATENÇÃO: isto APAGA os dados históricos de bonificação (lançamentos de
-- venda, fechamentos mensais, bonificações calculadas, ajustes, regras e os
-- espelhos de relatórios do elleven). Faça o dump antes de rodar:
--
--   pg_dump "$DATABASE_URL" \
--     -t '"Cidade"' -t '"Equipe"' -t '"Funcionario"' -t '"RegraBonificacao"' \
--     -t '"LancamentoVenda"' -t '"ImportLote"' -t '"FechamentoMensal"' \
--     -t '"BonificacaoCalculada"' -t '"Ajuste"' -t '"ContratoAtivacaoElleven"' \
--     -t '"contrato_ativacao_elleven"' -t '"elleven_relatorio_linha"' \
--     > backup-bonificacao.sql
--
-- IF EXISTS/CASCADE porque parte do histórico foi aplicada direto no banco,
-- fora do fluxo de migrations (ver 20260721120000_sync_funcionario_contato_e_
-- elleven_relatorio): a tabela do elleven existe sob dois nomes possíveis
-- conforme o ambiente, e as FKs entre elas não seguem uma ordem garantida.

DROP TABLE IF EXISTS "Ajuste" CASCADE;
DROP TABLE IF EXISTS "BonificacaoCalculada" CASCADE;
DROP TABLE IF EXISTS "FechamentoMensal" CASCADE;
DROP TABLE IF EXISTS "LancamentoVenda" CASCADE;
DROP TABLE IF EXISTS "ImportLote" CASCADE;
DROP TABLE IF EXISTS "RegraBonificacao" CASCADE;
DROP TABLE IF EXISTS "Funcionario" CASCADE;
DROP TABLE IF EXISTS "Equipe" CASCADE;
DROP TABLE IF EXISTS "Cidade" CASCADE;
DROP TABLE IF EXISTS "ContratoAtivacaoElleven" CASCADE;
DROP TABLE IF EXISTS "contrato_ativacao_elleven" CASCADE;
DROP TABLE IF EXISTS "elleven_relatorio_linha" CASCADE;
