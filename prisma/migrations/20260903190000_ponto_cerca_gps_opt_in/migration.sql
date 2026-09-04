-- A cerca de GPS do ponto era opt-OUT sem querer: "exigirGps" nascia `true`, e
-- as duas ações que criam a linha de configuração (salvarLimiteEstagio e
-- salvarTravaIpPonto) não citam a coluna. Bastava o RH salvar o teto do
-- estagiário ou a trava de IP para a empresa passar a exigir GPS com
-- latitude/longitude NULAS — e o portal recusar a batida de quem tivesse
-- negado a localização no celular, por uma cerca que ninguém cadastrou.
--
-- Aditiva: só muda o DEFAULT da coluna e corrige linhas que já nasceram
-- erradas. Nenhuma coluna é criada ou removida.
ALTER TABLE "rh"."ConfiguracaoPontoEmpresa" ALTER COLUMN "exigirGps" SET DEFAULT false;

-- Correção de dados. Exigir GPS sem coordenada não cerca nada: só bloqueia.
-- Em 03/09/2026 a produção tinha UMA única linha nesta tabela — a da VAPT,
-- com exigirGps=true E coordenada cadastrada, que este UPDATE não toca e que
-- continua valendo. As outras 8 empresas não têm linha. Ou seja: hoje isto
-- corrige ZERO linhas, e está aqui porque a migration também roda em preview,
-- em banco de CI e em qualquer restore anterior à correção.
UPDATE "rh"."ConfiguracaoPontoEmpresa"
   SET "exigirGps" = false
 WHERE "exigirGps" = true
   AND ("latitudeEmpresa" IS NULL OR "longitudeEmpresa" IS NULL);
