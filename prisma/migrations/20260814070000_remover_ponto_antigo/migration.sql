-- Remove as tabelas da PRIMEIRA implementação do ponto eletrônico.
--
-- O QUE ERAM. `Ponto` e `ConfiguracaoPonto` nasceram na versão inicial do
-- ponto, substituída pelo modelo REP-P (`RegistroPonto`, `TratamentoPonto`,
-- `ConfiguracaoPontoEmpresa`) — que tem NSR, hash SHA-256, as quatro marcações
-- do dia e o tratamento de inconsistências que a Portaria MTP 671/2021 exige.
-- A tabela antiga não tinha nada disso: guardava selfie em base64 na própria
-- coluna e só duas marcações por dia.
--
-- POR QUE PRECISAVAM SAIR, e não bastava ignorá-las. `Ponto` continuava sendo
-- CAMINHO DE ESCRITA: `lib/actions/portal-ponto.ts` era `"use server"`, ou
-- seja, endpoint POST público, e gravava ali. Nada no RH lia essa tabela, e o
-- gerador de AFD/AEJ também não — uma batida que caísse ali ficaria invisível
-- para o RH e fora dos arquivos fiscais. Tela removida não fecha endpoint;
-- só remover o código fecha.
--
-- POR QUE DÁ PARA APAGAR AGORA. O ponto ainda está em implantação e nenhuma
-- batida foi registrada (confirmado pelo Marcelo em 14/08/2026) — não há
-- registro de jornada a perder, que é o único motivo pelo qual uma tabela
-- destas se apagaria em vez de ficar parada com o histórico.
--
-- `ConfiguracaoPonto` (sem "Empresa") já não era referenciada nem pelo código
-- morto: sobrava só numa linha comentada.
--
-- CASCADE por causa da foreign key de Colaborador; a ordem não importa porque
-- nada mais aponta para estas duas.

DROP TABLE IF EXISTS "rh"."Ponto" CASCADE;
DROP TABLE IF EXISTS "rh"."ConfiguracaoPonto" CASCADE;
