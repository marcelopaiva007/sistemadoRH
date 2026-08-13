-- Avisos automáticos ao gestor: registro do que já foi enviado.
--
-- A tabela existe SÓ para silenciar repetição. Sem ela o cron avisaria todo dia
-- sobre o mesmo contrato até a data chegar, e o gestor aprenderia a ignorar o
-- bot — a falha realmente cara aqui, porque o aviso continua saindo e ninguém
-- mais lê. Ver DIAS_ENTRE_AVISOS em lib/aviso-gestor.ts.
--
-- O "gestor" é um Colaborador, não um User: não existe login com papel de
-- gestor de setor, e User não tem vínculo com Colaborador. Quem lidera é quem
-- tem outros apontando para si em `supervisorId` — a mesma definição que o
-- portal já usa para montar "Meu time".

CREATE TABLE "rh"."AvisoGestor" (
    "id"            TEXT NOT NULL,
    "gestorId"      TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo"          TEXT NOT NULL,
    "enviadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoGestor_pkey" PRIMARY KEY ("id")
);

-- A consulta do silenciamento filtra por janela de tempo e casa a trinca
-- (gestor, colaborador, tipo). O índice cobre as duas coisas na mesma ordem em
-- que a consulta as usa.
CREATE INDEX "AvisoGestor_gestorId_colaboradorId_tipo_enviadoEm_idx"
  ON "rh"."AvisoGestor"("gestorId", "colaboradorId", "tipo", "enviadoEm");

-- Para a varredura por janela, que roda antes de qualquer filtro por pessoa.
CREATE INDEX "AvisoGestor_enviadoEm_idx" ON "rh"."AvisoGestor"("enviadoEm");

-- CASCADE nos dois lados: apagado o colaborador, o registro de que ele foi
-- assunto de um aviso não tem mais sujeito. Diferente do caso do Disciplinar,
-- aqui não há valor probatório a preservar — é estado operacional de
-- silenciamento, não histórico que a fiscalização pede.
ALTER TABLE "rh"."AvisoGestor"
  ADD CONSTRAINT "AvisoGestor_gestorId_fkey"
  FOREIGN KEY ("gestorId") REFERENCES "rh"."Colaborador"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rh"."AvisoGestor"
  ADD CONSTRAINT "AvisoGestor_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
