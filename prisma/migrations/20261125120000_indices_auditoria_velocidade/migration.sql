-- Índices da Fase 1 da auditoria de velocidade (v1.209.0, 25/11/2026).
--
-- Só índices: nenhuma coluna muda e nenhum dado é tocado. Cobrem os filtros
-- mais repetidos que a auditoria achou sem índice próprio — "ativos destes
-- CNPJs" em Colaborador, "CNPJs ativos da marca" nas guardas de escopo, Sinais
-- por CNPJ e situação, e convites/respostas de pesquisa por pessoa.
-- Idempotente como as demais (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS "Empresa_marcaId_ativo_idx" ON "rh"."Empresa"("marcaId", "ativo");

CREATE INDEX IF NOT EXISTS "Colaborador_empresaId_ativo_idx" ON "rh"."Colaborador"("empresaId", "ativo");

CREATE INDEX IF NOT EXISTS "Sinal_empresaId_status_idx" ON "rh"."Sinal"("empresaId", "status");

CREATE INDEX IF NOT EXISTS "SurveyToken_colaboradorId_idx" ON "rh"."SurveyToken"("colaboradorId");

CREATE INDEX IF NOT EXISTS "Resposta_colaboradorId_idx" ON "rh"."Resposta"("colaboradorId");
