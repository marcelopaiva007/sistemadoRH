-- Complemento da 20260807200000_dispensar_offboarding_antigo: aquela migration
-- dispensou o offboarding dos desligamentos anteriores ao sistema que estavam
-- com data E motivo preenchidos — mas a importação de demitidos
-- (scripts/importar-demitidos-2024.ts) só grava a data, nunca o motivo, então
-- centenas de desligados históricos ficaram de fora da dispensa.
--
-- Isso era invisível até 19/08/2026, quando "Desligado sem checklist/sem
-- entrevista" entrou na tela de Pendências e no e-mail diário do RH
-- (lib/pendencias.ts): cada ficha importada virou até 2 pendências
-- permanentes, e o e-mail passaria a cobrar todo dia um offboarding que a
-- regra do CEO (07/08/2026) já dizia não ser cobrado retroativamente —
-- "checklist e entrevista não são cobrados retroativamente" vale pela época
-- da saída, não pelo motivo estar preenchido. O motivo em branco continua
-- visível na ficha e na tela /desligamentos; só deixa de gerar cobrança de
-- checklist/entrevista impossíveis.
--
-- Mesmas travas da migration original: só desligamento ANTERIOR ao próprio
-- cadastro (dataDesligamento < createdAt — desligamento novo, feito pela
-- ficha, nunca se encaixa), sem nenhum item de checklist já gerado e ainda não
-- dispensado. Reversível por pessoa pelo botão "Reverter dispensa" na ficha.
WITH dispensados AS (
  UPDATE "rh"."Colaborador" AS c
  SET "checklistDispensado"        = true,
      "checklistDispensadoEm"      = now(),
      "checklistDispensadoPorNome" = 'Sistema (regularização dos desligamentos importados)'
  WHERE c."dataDesligamento" IS NOT NULL
    AND c."dataDesligamento" < c."createdAt"
    AND (c."motivoDesligamento" IS NULL OR btrim(c."motivoDesligamento") = '')
    AND c."checklistDispensado" = false
    AND NOT EXISTS (
      SELECT 1 FROM "rh"."ChecklistDesligamento" cd WHERE cd."colaboradorId" = c."id"
    )
  RETURNING c."id", c."empresaId", c."nome"
)
-- Trilha de auditoria por pessoa, como a dispensa manual e a migration
-- original fazem (append-only).
INSERT INTO "rh"."AuditLog" ("id", "empresaId", "usuarioNome", "usuarioRole", "acao", "entidade", "entidadeId", "resumo", "createdAt")
SELECT gen_random_uuid()::text,
       d."empresaId",
       'Sistema (regularização dos desligamentos importados)',
       'SISTEMA',
       'ATUALIZAR',
       'Colaborador',
       d."id",
       'Offboarding de ' || d."nome" || ' dispensado em massa (desligamento importado, anterior ao sistema e sem motivo registrado): checklist e entrevista fora das pendências.',
       now()
FROM dispensados AS d;
