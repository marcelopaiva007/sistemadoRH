-- Ponto Eletrônico & Gestão de Jornada (REP-P / Portaria MTP 671/2021)
--
-- Criação dos modelos de JornadaTrabalho, RegistroPonto (Append-Only),
-- TratamentoPonto (PTRP), BancoHoras e ConfiguracaoPontoEmpresa.

-- 1. JornadaTrabalho
CREATE TABLE "rh"."JornadaTrabalho" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "entrada1" TEXT NOT NULL,
    "saida1" TEXT NOT NULL,
    "entrada2" TEXT,
    "saida2" TEXT,
    "cargaDiariaMin" INTEGER NOT NULL DEFAULT 480,
    "toleranciaMin" INTEGER NOT NULL DEFAULT 10,
    "sabadoUtil" BOOLEAN NOT NULL DEFAULT false,
    "domingoUtil" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JornadaTrabalho_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JornadaTrabalho_empresaId_ativo_idx" ON "rh"."JornadaTrabalho"("empresaId", "ativo");

-- 2. RegistroPonto (REP-P - Append-Only)
CREATE TABLE "rh"."RegistroPonto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "nsr" BIGINT NOT NULL,
    "ipOrigem" TEXT,
    "ipValido" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisaoGps" DOUBLE PRECISION,
    "gpsValido" BOOLEAN NOT NULL DEFAULT true,
    "fotoUrl" TEXT,
    "hashSHA256" TEXT NOT NULL,
    "dispositivoInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroPonto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistroPonto_empresaId_dataHora_idx" ON "rh"."RegistroPonto"("empresaId", "dataHora");
CREATE INDEX "RegistroPonto_colaboradorId_dataHora_idx" ON "rh"."RegistroPonto"("colaboradorId", "dataHora");
CREATE INDEX "RegistroPonto_empresaId_nsr_idx" ON "rh"."RegistroPonto"("empresaId", "nsr");

ALTER TABLE "rh"."RegistroPonto" ADD CONSTRAINT "RegistroPonto_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. TratamentoPonto (PTRP)
CREATE TABLE "rh"."TratamentoPonto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "registroPontoId" TEXT,
    "dataFato" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "arquivoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "aprovadoPorId" TEXT,
    "aprovadoPorNome" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TratamentoPonto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TratamentoPonto_arquivoId_key" ON "rh"."TratamentoPonto"("arquivoId");
CREATE INDEX "TratamentoPonto_empresaId_dataFato_idx" ON "rh"."TratamentoPonto"("empresaId", "dataFato");
CREATE INDEX "TratamentoPonto_colaboradorId_dataFato_idx" ON "rh"."TratamentoPonto"("colaboradorId", "dataFato");

ALTER TABLE "rh"."TratamentoPonto" ADD CONSTRAINT "TratamentoPonto_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."TratamentoPonto" ADD CONSTRAINT "TratamentoPonto_registroPontoId_fkey" FOREIGN KEY ("registroPontoId") REFERENCES "rh"."RegistroPonto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rh"."TratamentoPonto" ADD CONSTRAINT "TratamentoPonto_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. BancoHoras
CREATE TABLE "rh"."BancoHoras" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "saldoAnterior" INTEGER NOT NULL DEFAULT 0,
    "creditosMes" INTEGER NOT NULL DEFAULT 0,
    "debitosMes" INTEGER NOT NULL DEFAULT 0,
    "saldoAtual" INTEGER NOT NULL DEFAULT 0,
    "expiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BancoHoras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BancoHoras_colaboradorId_competencia_key" ON "rh"."BancoHoras"("colaboradorId", "competencia");
CREATE INDEX "BancoHoras_empresaId_competencia_idx" ON "rh"."BancoHoras"("empresaId", "competencia");

ALTER TABLE "rh"."BancoHoras" ADD CONSTRAINT "BancoHoras_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. ConfiguracaoPontoEmpresa
CREATE TABLE "rh"."ConfiguracaoPontoEmpresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ipsAutorizados" TEXT,
    "exigirIp" BOOLEAN NOT NULL DEFAULT false,
    "latitudeEmpresa" DOUBLE PRECISION,
    "longitudeEmpresa" DOUBLE PRECISION,
    "raioPermitidoMtrs" INTEGER NOT NULL DEFAULT 200,
    "exigirGps" BOOLEAN NOT NULL DEFAULT true,
    "exigirFoto" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPontoEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfiguracaoPontoEmpresa_empresaId_key" ON "rh"."ConfiguracaoPontoEmpresa"("empresaId");

ALTER TABLE "rh"."ConfiguracaoPontoEmpresa" ADD CONSTRAINT "ConfiguracaoPontoEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "rh"."Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
