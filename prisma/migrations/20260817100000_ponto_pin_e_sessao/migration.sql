-- App de ponto separado (/ponto): login por CPF + PIN, sem Telegram.
--
-- `pontoPinHash` guarda só o bcrypt do PIN — o valor em claro existe uma vez,
-- no retorno da action que o RH usa para gerar. `null` = sem PIN, login
-- recusado.
ALTER TABLE "rh"."Colaborador" ADD COLUMN "pontoPinHash" TEXT;

-- Sessão do app de ponto, separada de PortalSessao de propósito: nunca abre
-- documentos, salário ou Fale com o RH. Só o SHA-256 do token no banco.
CREATE TABLE "rh"."PontoSessao" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "encerradaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PontoSessao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PontoSessao_tokenHash_key" ON "rh"."PontoSessao"("tokenHash");

CREATE INDEX "PontoSessao_colaboradorId_encerradaEm_idx" ON "rh"."PontoSessao"("colaboradorId", "encerradaEm");

ALTER TABLE "rh"."PontoSessao" ADD CONSTRAINT "PontoSessao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
