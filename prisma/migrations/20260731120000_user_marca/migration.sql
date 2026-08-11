-- Acesso concedido a uma MARCA inteira, em vez de CNPJ a CNPJ.
--
-- Tabela própria e não coluna em UserEmpresa: lá empresaId é NOT NULL e a
-- unicidade é (userId, empresaId), que não acomoda "a marca toda" sem inventar
-- linha fantasma.
--
-- O vínculo é dinâmico: CNPJ cadastrado depois, na mesma marca, entra no acesso
-- sozinho. Quem resolve isso é empresasVisiveis() em lib/rh-auth-guard.ts, a
-- cada request — nunca o JWT, que congelaria a lista até o próximo login.

CREATE TABLE rh."UserMarca" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "marcaId"   TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMarca_pkey" PRIMARY KEY ("id")
);

-- Usuário apagado leva os vínculos junto (CASCADE). Marca, não: apagar uma
-- marca com gente vinculada tem que doer (RESTRICT, o padrão).
ALTER TABLE rh."UserMarca"
  ADD CONSTRAINT "UserMarca_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES rh."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE rh."UserMarca"
  ADD CONSTRAINT "UserMarca_marcaId_fkey"
  FOREIGN KEY ("marcaId") REFERENCES rh."Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserMarca_userId_marcaId_key" ON rh."UserMarca"("userId", "marcaId");
CREATE INDEX "UserMarca_userId_idx" ON rh."UserMarca"("userId");
CREATE INDEX "UserMarca_marcaId_idx" ON rh."UserMarca"("marcaId");
