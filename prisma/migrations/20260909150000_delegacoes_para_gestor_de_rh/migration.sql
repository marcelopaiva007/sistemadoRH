-- Delegações para o perfil "Gestor de RH" (09/09/2026, decisão do CEO).
--
-- O PROBLEMA. Angela, do RH, não enxergava o módulo Delegações — nem o item no
-- seletor da barra de topo, nem a rota. Não era defeito: o acesso a módulo vem
-- dos grants do PERFIL (lib/permissoes/efetivas.ts::sistemasPermitidos), e o
-- perfil-semente "Gestor de RH" nasceu em 24/08/2026 com `rh:*,processos:*` —
-- os dois módulos que existiam então. Delegações veio depois (01/09) e não foi
-- concedida a ninguém: só ADMIN e DIRETORIA a alcançavam, e por tabela, pelo
-- curinga `*`. O comentário em components/modulos.ts dizia, com todas as
-- letras, que dar Delegações ao RH seria decisão de gestão, tomada na tela de
-- Perfis. Foi tomada — é esta migration.
--
-- POR QUE MIGRATION E NÃO A TELA. Vale a mesma escolha de
-- 20260807200000_dispensar_offboarding_antigo: mudança de dado de produção
-- feita por aqui fica versionada, com o motivo escrito ao lado e aplicada pelo
-- build. Pela tela ela aconteceria e ninguém saberia por quê seis meses depois.
--
-- POR QUE O PERFIL, E NÃO A CONTA DA ANGELA. Escolha do CEO: quem é Gestor de
-- RH trabalha com delegações. Concedendo ao perfil, quem entrar nele amanhã já
-- nasce com o acesso — vincular perfil a mais uma pessoa é o caminho normal da
-- tela de Usuários, e não exige código nenhum.
--
-- IDEMPOTENTE, E ADITIVA. O WHERE não toca a linha se `delegacoes` já estiver
-- lá — reaplicar não duplica o grant. Nenhuma permissão é retirada de ninguém:
-- o UPDATE só concatena. A leitura de grants (`grants.split(",")` em
-- efetivas.ts) ignora espaço em volta, mas o valor é gravado sem espaço para
-- ficar igual ao formato do seed.
--
-- SE PRECISAR DESFAZER, é o inverso, na tela de Perfis ou em SQL:
--   UPDATE "rh"."Perfil"
--      SET "grants" = replace(replace("grants", ',delegacoes:*', ''), 'delegacoes:*', '')
--    WHERE "id" = 'perfil-semente-rh';
--
-- O espelho desta linha no código é PERFIS_SEMENTE em lib/permissoes/catalogo.ts
-- e o fallback por papel em components/modulos.ts — os três mudaram no mesmo
-- commit, e scripts/test-permissoes.ts falha se um deles ficar para trás.

UPDATE "rh"."Perfil"
   SET "grants" = "grants" || ',delegacoes:*',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 'perfil-semente-rh'
   AND "grants" NOT LIKE '%delegacoes:%';
