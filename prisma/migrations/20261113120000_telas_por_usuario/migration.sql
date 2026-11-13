-- Telas que cada usuário vê (v1.207.0).
--
-- Pedido do CEO em 13/11/2026: no cadastro do usuário, escolher quais abas do
-- topo a pessoa enxerga — Pessoas (RH), Frota, Contratos. Lista vazia = sem
-- recorte, então nenhuma conta existente perde acesso com esta migration.
-- Idempotente como as demais.

ALTER TABLE "rh"."User" ADD COLUMN IF NOT EXISTS "telas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
