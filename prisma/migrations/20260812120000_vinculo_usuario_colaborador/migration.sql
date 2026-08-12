-- Liga um login (User) à ficha da pessoa (Colaborador).
--
-- Nulo em todas as linhas existentes: ninguém fica vinculado sozinho. O RH
-- aponta o vínculo na tela de usuários, um a um — não há como adivinhar, porque
-- `username` não tem relação nenhuma com o nome da ficha.
ALTER TABLE "rh"."User" ADD COLUMN "colaboradorId" TEXT;

-- 1:1: duas contas na mesma ficha fariam "meu time" mudar conforme o login.
CREATE UNIQUE INDEX "User_colaboradorId_key" ON "rh"."User"("colaboradorId");

-- SET NULL e não CASCADE: apagar a ficha não pode levar junto o login, que é
-- quem assina os registros de auditoria.
ALTER TABLE "rh"."User"
  ADD CONSTRAINT "User_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
