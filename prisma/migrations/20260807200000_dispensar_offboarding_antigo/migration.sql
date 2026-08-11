-- Dispensa o offboarding (checklist + entrevista) dos desligamentos ANTIGOS já
-- regularizados — quem saiu antes de o próprio cadastro existir no sistema
-- (importado do elleven/planilha já desligado) e está com data E motivo de
-- desligamento preenchidos.
--
-- Regra definida pelo CEO em 07/08/2026: para desligamento anterior ao sistema,
-- regularizar = preencher data + motivo; checklist e entrevista não são
-- cobrados retroativamente. Daqui pra frente corrigirDadosDesligamento
-- (lib/actions/rh-offboarding.ts) dispensa sozinho ao salvar; esta migration
-- cobre quem já tinha sido preenchido ANTES de a regra existir.
--
-- Mesmas travas da dispensa manual: não mexe em quem já tem item de checklist
-- gerado (termina os itens em vez de dispensar) nem em quem já está dispensado.
-- "Antigo" = dataDesligamento anterior ao createdAt do registro — desligamento
-- novo, feito pela ficha, nunca se encaixa. Reversível por pessoa pelo botão
-- "Reverter dispensa" na ficha.
--
-- Migration de DADOS (DML), não de schema — mora aqui porque é o caminho que
-- roda em produção no próprio build (prisma/checar-migracoes.mjs).
WITH dispensados AS (
  UPDATE "rh"."Colaborador" AS c
  SET "checklistDispensado"        = true,
      "checklistDispensadoEm"      = now(),
      "checklistDispensadoPorNome" = 'Sistema (regularização dos desligamentos importados)'
  WHERE c."dataDesligamento" IS NOT NULL
    AND c."dataDesligamento" < c."createdAt"
    AND c."motivoDesligamento" IS NOT NULL
    AND btrim(c."motivoDesligamento") <> ''
    AND c."checklistDispensado" = false
    AND NOT EXISTS (
      SELECT 1 FROM "rh"."ChecklistDesligamento" cd WHERE cd."colaboradorId" = c."id"
    )
  RETURNING c."id", c."empresaId", c."nome"
)
-- Trilha de auditoria por pessoa, como a dispensa manual faz (append-only).
INSERT INTO "rh"."AuditLog" ("id", "empresaId", "usuarioNome", "usuarioRole", "acao", "entidade", "entidadeId", "resumo", "createdAt")
SELECT gen_random_uuid()::text,
       d."empresaId",
       'Sistema (regularização dos desligamentos importados)',
       'SISTEMA',
       'ATUALIZAR',
       'Colaborador',
       d."id",
       'Offboarding de ' || d."nome" || ' dispensado em massa (desligamento anterior ao sistema, data e motivo preenchidos): checklist e entrevista fora das pendências.',
       now()
FROM dispensados AS d;
