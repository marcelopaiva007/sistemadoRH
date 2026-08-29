-- Favoritos de delegação: as pessoas que aparecem na frente, com um clique,
-- na hora de criar a demanda (pedido da Direção em 29/08/2026).
--
-- Só CREATEs — nada existente muda. Cascade nos dois lados de propósito: é
-- preferência de tela, não histórico; se o usuário sumir, a linha some junto e
-- não sobra referência morta. O histórico que precisa sobreviver a exclusões
-- é o da demanda, e aquele não tem FK para cá.
-- CreateTable
CREATE TABLE "rh"."DelegacaoFavorito" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoritoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegacaoFavorito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DelegacaoFavorito_userId_idx" ON "rh"."DelegacaoFavorito"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegacaoFavorito_userId_favoritoId_key" ON "rh"."DelegacaoFavorito"("userId", "favoritoId");

-- AddForeignKey
ALTER TABLE "rh"."DelegacaoFavorito" ADD CONSTRAINT "DelegacaoFavorito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rh"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DelegacaoFavorito" ADD CONSTRAINT "DelegacaoFavorito_favoritoId_fkey" FOREIGN KEY ("favoritoId") REFERENCES "rh"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

