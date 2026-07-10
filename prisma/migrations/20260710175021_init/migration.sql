-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Cidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "supervisorId" TEXT,
    "tamanhoTier" INTEGER,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "cidadeId" TEXT,
    "equipeId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraBonificacao" (
    "id" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "metaQtd" INTEGER,
    "valorMeta" DOUBLE PRECISION,
    "superMetaQtd" INTEGER,
    "valorSuperMeta" DOUBLE PRECISION,
    "percentualTaxaAtivacao" DOUBLE PRECISION,
    "valoresPorProduto" JSONB,
    "regraSupervisor" JSONB,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegraBonificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoVenda" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "aprovado" INTEGER NOT NULL DEFAULT 0,
    "cancelado" INTEGER NOT NULL DEFAULT 0,
    "valorInstalado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtdInternet" INTEGER NOT NULL DEFAULT 0,
    "qtdChip" INTEGER NOT NULL DEFAULT 0,
    "qtdGps" INTEGER NOT NULL DEFAULT 0,
    "qtdStreaming" INTEGER NOT NULL DEFAULT 0,
    "qtdTelefoniaFixa" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "importLoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LancamentoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLote" (
    "id" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "dataImportacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "linhasOk" INTEGER NOT NULL DEFAULT 0,
    "linhasErro" INTEGER NOT NULL DEFAULT 0,
    "mapeamentoJson" JSONB,
    "detalhesErrosJson" JSONB,

    CONSTRAINT "ImportLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FechamentoMensal" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "valorTotalVendido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotalBonificacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechadoPorId" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FechamentoMensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonificacaoCalculada" (
    "id" TEXT NOT NULL,
    "fechamentoId" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "valorBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorMeta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorSuperMeta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorProdutos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorSupervisor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detalhesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonificacaoCalculada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ajuste" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "fechamentoId" TEXT,
    "periodo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ajuste_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Cidade_nome_key" ON "Cidade"("nome");

-- CreateIndex
CREATE INDEX "Funcionario_cidadeId_idx" ON "Funcionario"("cidadeId");

-- CreateIndex
CREATE INDEX "Funcionario_equipeId_idx" ON "Funcionario"("equipeId");

-- CreateIndex
CREATE INDEX "RegraBonificacao_cargo_vigenciaInicio_idx" ON "RegraBonificacao"("cargo", "vigenciaInicio");

-- CreateIndex
CREATE INDEX "LancamentoVenda_funcionarioId_periodo_idx" ON "LancamentoVenda"("funcionarioId", "periodo");

-- CreateIndex
CREATE INDEX "LancamentoVenda_periodo_idx" ON "LancamentoVenda"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "FechamentoMensal_periodo_key" ON "FechamentoMensal"("periodo");

-- CreateIndex
CREATE INDEX "BonificacaoCalculada_funcionarioId_idx" ON "BonificacaoCalculada"("funcionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "BonificacaoCalculada_fechamentoId_funcionarioId_key" ON "BonificacaoCalculada"("fechamentoId", "funcionarioId");

-- CreateIndex
CREATE INDEX "Ajuste_funcionarioId_periodo_idx" ON "Ajuste"("funcionarioId", "periodo");

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Funcionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funcionario" ADD CONSTRAINT "Funcionario_cidadeId_fkey" FOREIGN KEY ("cidadeId") REFERENCES "Cidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funcionario" ADD CONSTRAINT "Funcionario_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoVenda" ADD CONSTRAINT "LancamentoVenda_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoVenda" ADD CONSTRAINT "LancamentoVenda_importLoteId_fkey" FOREIGN KEY ("importLoteId") REFERENCES "ImportLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportLote" ADD CONSTRAINT "ImportLote_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FechamentoMensal" ADD CONSTRAINT "FechamentoMensal_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonificacaoCalculada" ADD CONSTRAINT "BonificacaoCalculada_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "FechamentoMensal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonificacaoCalculada" ADD CONSTRAINT "BonificacaoCalculada_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajuste" ADD CONSTRAINT "Ajuste_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajuste" ADD CONSTRAINT "Ajuste_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "FechamentoMensal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
