-- Controle de acesso fino — Onda 1 (24/08/2026). Decisão do CEO: permissão por
-- tela, com Perfis atribuíveis. Esta migration é a FUNDAÇÃO, invisível na tela.
--
-- ADITIVA em forma: duas tabelas novas (Perfil, UserPerfil), nenhum ALTER em
-- tabela existente. Escreve DADO, sim — os 4 perfis-semente e o vínculo de cada
-- usuário existente ao seu perfil —, mas só nas tabelas novas, e de forma
-- idempotente-por-construção (as tabelas nascem vazias neste mesmo arquivo).
--
-- POR QUE SEMEAR AQUI: o seed reproduz EXATAMENTE o acesso de hoje (Admin/
-- Diretoria/Gestor de RH veem os dois sistemas; Gestor de Setor fica no próprio
-- setor). Rodando no deploy junto da criação das tabelas, nenhum usuário fica
-- um instante sem perfil. As guardas atuais (por `role`) continuam valendo em
-- paralelo — nada de acesso muda até a Onda 2. scripts/test-permissoes.ts prova
-- que o alcance pelo novo modelo == alcance de hoje.
--
-- Os grants usam curinga (`*`, `rh:*`) de propósito: o seed fica curto e
-- estável, e não duplica no SQL a lista de ~100 permissões que vive no código
-- (lib/permissoes/catalogo.ts). A tela da Onda 2 expande em permissões exatas
-- quando o usuário editar.

-- CreateTable
CREATE TABLE "rh"."Perfil" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "grants" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."UserPerfil" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPerfil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_nome_key" ON "rh"."Perfil"("nome");

-- CreateIndex
CREATE INDEX "UserPerfil_perfilId_idx" ON "rh"."UserPerfil"("perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPerfil_userId_perfilId_key" ON "rh"."UserPerfil"("userId", "perfilId");

-- AddForeignKey
ALTER TABLE "rh"."UserPerfil" ADD CONSTRAINT "UserPerfil_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rh"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."UserPerfil" ADD CONSTRAINT "UserPerfil_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "rh"."Perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: perfis-semente (retrato fiel do acesso de hoje)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "rh"."Perfil" ("id","nome","descricao","grants","sistema","ativo","createdAt","updatedAt") VALUES
  ('perfil-semente-admin','Administrador','Acesso total aos dois sistemas, incluindo Marcas & CNPJs e configuração.','*',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('perfil-semente-diretoria','Diretoria','Acesso total aos dois sistemas (mesmo alcance de hoje). A distinção de CNPJ vem na Onda 2.','*',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('perfil-semente-rh','Gestor de RH','Os dois sistemas, como hoje. Ajuste para ''só RH'' editando este perfil na Onda 2.','rh:*,processos:*',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('perfil-semente-gestor-setor','Gestor de Setor','Só o próprio setor — o escopo restrito que já existe hoje.','rh:time:ver,rh:colaboradores:ver',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- SEED: vincula cada usuário existente ao perfil do seu papel. Papel fora dos
-- quatro conhecidos (não deve existir) fica sem perfil — melhor sem acesso novo
-- que com acesso errado; as guardas antigas seguem valendo de qualquer forma.
INSERT INTO "rh"."UserPerfil" ("id","userId","perfilId","createdAt")
SELECT gen_random_uuid()::text, u."id",
  CASE u."role"
    WHEN 'ADMIN' THEN 'perfil-semente-admin'
    WHEN 'DIRETORIA' THEN 'perfil-semente-diretoria'
    WHEN 'RH_MANAGER' THEN 'perfil-semente-rh'
    WHEN 'GESTOR_SETOR' THEN 'perfil-semente-gestor-setor'
  END,
  CURRENT_TIMESTAMP
FROM "rh"."User" u
WHERE u."role" IN ('ADMIN','DIRETORIA','RH_MANAGER','GESTOR_SETOR');
