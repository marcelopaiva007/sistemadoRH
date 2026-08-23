-- Módulo Processos & Ativos — onda 1, parte 1: frota e a Central de Pendências
-- (23/08/2026). Base: `estudo-modulo-processos-ativos.md`, seis frentes de
-- pesquisa com cada norma conferida em fonte primária.
--
-- PURAMENTE ADITIVA: onze tabelas novas, nenhum ALTER em tabela existente,
-- nenhum dado tocado. As FKs abaixo apontam só para as tabelas criadas aqui,
-- exceto Condutor -> Colaborador, que é uma extensão 1:1 do colaborador que já
-- existe (quem dirige não vira cadastro paralelo de motorista).
--
-- Sobe SOZINHA, sem tela nenhuma, e é de propósito: `prisma/checar-migracoes.mjs`
-- derrubaria o build de Preview de qualquer PR que trouxesse tabela nova junto
-- com as telas — e aí a PR das telas ficaria sem endereço de teste na Vercel,
-- que é justamente como o AGENTS.md manda conferir mudança de tela. Tabela
-- vazia em produção não muda nada para quem usa o sistema.
--
-- Três decisões de modelagem que a pesquisa mostrou serem armadilhas:
--
--   1. NÃO existe tipo DPVAT nem SPVAT em DocumentoVeiculo. Os dois foram
--      revogados e não há seguro obrigatório público sendo cobrado — o campo
--      criaria um alerta que nunca resolve, e falso positivo eterno desmoraliza
--      a lista inteira. O que fica é seguro privado (casco e RCF-V).
--   2. `Condutor.pontosAcumulados` é somatório do que DE FATO pontuou, e não
--      conta derivada da gravidade: o CTB exclui de pontuação sete dispositivos
--      (art. 259, §4º, II). Derivar da natureza acusa colaborador injustamente.
--   3. Os prazos de Infracao são COLUNAS, não contas na leitura. No SNE o
--      proprietário é considerado notificado 30 dias após a inclusão no sistema
--      (art. 282-A, §2º), não na data do e-mail — e um alerta histórico precisa
--      continuar explicável depois de a regra mudar.
--
-- AlocacaoVeiculo é a tabela mais importante daqui e não parece: ela responde
-- "quem estava com a placa ABC1D23 no dia 14/03 às 15h22?", que é o que a Res.
-- CONTRAN 918/2022 (art. 5º, §1º, II) exige para indicar o condutor sem a
-- assinatura dele. Sem esse histórico, indicar condutor continua sendo trabalho
-- manual de trinta dias — e não indicar custa 3× o valor da multa.

-- CreateTable
CREATE TABLE "rh"."Pendencia" (
    "id" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavelId" TEXT,
    "responsavelNome" TEXT,
    "substitutoId" TEXT,
    "substitutoNome" TEXT,
    "venceEm" TIMESTAMP(3) NOT NULL,
    "contagem" TEXT NOT NULL DEFAULT 'DIAS_CORRIDOS',
    "origemLegal" TEXT NOT NULL DEFAULT 'INTERNO',
    "severidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABERTA',
    "dispensadaMotivo" TEXT,
    "resolvidaPorId" TEXT,
    "resolvidaPorNome" TEXT,
    "resolvidaEm" TIMESTAMP(3),
    "chaveDedupe" TEXT NOT NULL,
    "detectadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pendencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."RegraAlerta" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "diasAntecedencia" TEXT NOT NULL,
    "escalonaAposDias" INTEGER,
    "responsavelPadraoUserId" TEXT,
    "responsavelPadraoNome" TEXT,
    "escalonaParaUserId" TEXT,
    "severidadeBase" TEXT NOT NULL DEFAULT 'ATENCAO',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."Feriado" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "abrangencia" TEXT NOT NULL,
    "uf" TEXT,
    "municipio" TEXT,
    "tribunal" TEXT,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."Veiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "placaAnterior" TEXT,
    "renavam" TEXT,
    "chassi" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "anoFab" INTEGER,
    "anoModelo" INTEGER,
    "categoria" TEXT,
    "especie" TEXT,
    "pbt" DOUBLE PRECISION,
    "cmt" DOUBLE PRECISION,
    "ufEmplacamento" TEXT,
    "municipioEmplacamento" TEXT,
    "propriedade" TEXT NOT NULL DEFAULT 'PROPRIO',
    "motorizacao" TEXT NOT NULL DEFAULT 'COMBUSTAO',
    "aderidoSne" BOOLEAN NOT NULL DEFAULT false,
    "dataAdesaoSne" TIMESTAMP(3),
    "recallPendente" BOOLEAN NOT NULL DEFAULT false,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
    "dataAquisicao" TIMESTAMP(3),
    "dataVenda" TIMESTAMP(3),
    "hodometroAtual" INTEGER,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."Condutor" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cnhNumero" TEXT,
    "cnhCategoria" TEXT,
    "cnhUf" TEXT,
    "cnhValidade" TIMESTAMP(3),
    "possuiEAR" BOOLEAN NOT NULL DEFAULT false,
    "toxicologicoUltimaData" TIMESTAMP(3),
    "toxicologicoValidade" TIMESTAMP(3),
    "pontosAcumulados" INTEGER NOT NULL DEFAULT 0,
    "limitePontosAplicavel" INTEGER NOT NULL DEFAULT 20,
    "cursoReciclagemUltimaData" TIMESTAMP(3),
    "statusHabilitacao" TEXT NOT NULL DEFAULT 'APTO',
    "condutorExterno" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."AlocacaoVeiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "condutorId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "tipo" TEXT NOT NULL DEFAULT 'PERMANENTE',
    "termoArquivoId" TEXT,
    "kmEntrega" INTEGER,
    "kmDevolucao" INTEGER,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlocacaoVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."Infracao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "numeroAIT" TEXT NOT NULL,
    "orgaoAutuador" TEXT,
    "dataHoraInfracao" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "codigoInfracao" TEXT,
    "descricao" TEXT,
    "natureza" TEXT,
    "geraPontos" BOOLEAN NOT NULL DEFAULT true,
    "pontos" INTEGER NOT NULL DEFAULT 0,
    "valorOriginal" DOUBLE PRECISION,
    "fatorMultiplicador" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dataExpedicaoNA" TIMESTAMP(3),
    "dataNotificacaoFicta" TIMESTAMP(3),
    "prazoIndicacaoCondutor" TIMESTAMP(3),
    "prazoDefesaAutuacao" TIMESTAMP(3),
    "dataExpedicaoNP" TIMESTAMP(3),
    "prazoRecursoJARI" TIMESTAMP(3),
    "dataVencimentoPagamento" TIMESTAMP(3),
    "condutorIndicadoId" TEXT,
    "dataIndicacao" TIMESTAMP(3),
    "formaIndicacao" TEXT,
    "statusIndicacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "statusProcessual" TEXT NOT NULL DEFAULT 'AUTUADA',
    "descontoAplicado" INTEGER NOT NULL DEFAULT 0,
    "multaNicGerada" BOOLEAN NOT NULL DEFAULT false,
    "infracaoOriginalId" TEXT,
    "arquivoId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Infracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."DocumentoVeiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "exercicio" INTEGER,
    "dataEmissao" TIMESTAMP(3),
    "dataVencimento" TIMESTAMP(3),
    "valor" DOUBLE PRECISION,
    "arquivoId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."TransferenciaVeiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "contraparteNome" TEXT,
    "contraparteDocumento" TEXT,
    "municipioContraparte" TEXT,
    "dataNegocio" TIMESTAMP(3) NOT NULL,
    "modalidadeAtpv" TEXT NOT NULL DEFAULT 'ELETRONICA',
    "prazoNovoCrv" TIMESTAMP(3),
    "prazoComunicacaoVenda" TIMESTAMP(3),
    "dataComunicacaoVenda" TIMESTAMP(3),
    "comprovanteArquivoId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferenciaVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."ConsumoVeiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "condutorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "combustivel" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "hodometro" INTEGER,
    "posto" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumoVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."ManutencaoVeiculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION,
    "hodometro" INTEGER,
    "fornecedor" TEXT,
    "proximaRevisaoData" TIMESTAMP(3),
    "proximaRevisaoKm" INTEGER,
    "arquivoId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutencaoVeiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pendencia_estado_venceEm_responsavelId_empresaId_idx" ON "rh"."Pendencia"("estado", "venceEm", "responsavelId", "empresaId");

-- CreateIndex
CREATE INDEX "Pendencia_chaveDedupe_idx" ON "rh"."Pendencia"("chaveDedupe");

-- CreateIndex
CREATE INDEX "Pendencia_empresaId_dominio_estado_idx" ON "rh"."Pendencia"("empresaId", "dominio", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "RegraAlerta_tipo_empresaId_key" ON "rh"."RegraAlerta"("tipo", "empresaId");

-- CreateIndex
CREATE INDEX "Feriado_data_abrangencia_idx" ON "rh"."Feriado"("data", "abrangencia");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "rh"."Veiculo"("placa");

-- CreateIndex
CREATE INDEX "Veiculo_empresaId_situacao_idx" ON "rh"."Veiculo"("empresaId", "situacao");

-- CreateIndex
CREATE INDEX "Veiculo_empresaId_ufEmplacamento_idx" ON "rh"."Veiculo"("empresaId", "ufEmplacamento");

-- CreateIndex
CREATE UNIQUE INDEX "Condutor_colaboradorId_key" ON "rh"."Condutor"("colaboradorId");

-- CreateIndex
CREATE INDEX "Condutor_empresaId_statusHabilitacao_idx" ON "rh"."Condutor"("empresaId", "statusHabilitacao");

-- CreateIndex
CREATE INDEX "Condutor_empresaId_cnhValidade_idx" ON "rh"."Condutor"("empresaId", "cnhValidade");

-- CreateIndex
CREATE INDEX "AlocacaoVeiculo_veiculoId_dataInicio_dataFim_idx" ON "rh"."AlocacaoVeiculo"("veiculoId", "dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "AlocacaoVeiculo_condutorId_dataInicio_idx" ON "rh"."AlocacaoVeiculo"("condutorId", "dataInicio");

-- CreateIndex
CREATE INDEX "AlocacaoVeiculo_empresaId_idx" ON "rh"."AlocacaoVeiculo"("empresaId");

-- CreateIndex
CREATE INDEX "Infracao_empresaId_statusIndicacao_prazoIndicacaoCondutor_idx" ON "rh"."Infracao"("empresaId", "statusIndicacao", "prazoIndicacaoCondutor");

-- CreateIndex
CREATE INDEX "Infracao_empresaId_statusProcessual_idx" ON "rh"."Infracao"("empresaId", "statusProcessual");

-- CreateIndex
CREATE INDEX "Infracao_veiculoId_dataHoraInfracao_idx" ON "rh"."Infracao"("veiculoId", "dataHoraInfracao");

-- CreateIndex
CREATE UNIQUE INDEX "Infracao_numeroAIT_empresaId_key" ON "rh"."Infracao"("numeroAIT", "empresaId");

-- CreateIndex
CREATE INDEX "DocumentoVeiculo_empresaId_dataVencimento_idx" ON "rh"."DocumentoVeiculo"("empresaId", "dataVencimento");

-- CreateIndex
CREATE INDEX "DocumentoVeiculo_veiculoId_tipo_exercicio_idx" ON "rh"."DocumentoVeiculo"("veiculoId", "tipo", "exercicio");

-- CreateIndex
CREATE INDEX "TransferenciaVeiculo_empresaId_tipo_idx" ON "rh"."TransferenciaVeiculo"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "TransferenciaVeiculo_veiculoId_idx" ON "rh"."TransferenciaVeiculo"("veiculoId");

-- CreateIndex
CREATE INDEX "ConsumoVeiculo_veiculoId_data_idx" ON "rh"."ConsumoVeiculo"("veiculoId", "data");

-- CreateIndex
CREATE INDEX "ConsumoVeiculo_empresaId_data_idx" ON "rh"."ConsumoVeiculo"("empresaId", "data");

-- CreateIndex
CREATE INDEX "ConsumoVeiculo_condutorId_data_idx" ON "rh"."ConsumoVeiculo"("condutorId", "data");

-- CreateIndex
CREATE INDEX "ManutencaoVeiculo_veiculoId_data_idx" ON "rh"."ManutencaoVeiculo"("veiculoId", "data");

-- CreateIndex
CREATE INDEX "ManutencaoVeiculo_empresaId_data_idx" ON "rh"."ManutencaoVeiculo"("empresaId", "data");

-- CreateIndex
CREATE INDEX "ManutencaoVeiculo_empresaId_proximaRevisaoData_idx" ON "rh"."ManutencaoVeiculo"("empresaId", "proximaRevisaoData");

-- AddForeignKey
ALTER TABLE "rh"."Condutor" ADD CONSTRAINT "Condutor_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."AlocacaoVeiculo" ADD CONSTRAINT "AlocacaoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."AlocacaoVeiculo" ADD CONSTRAINT "AlocacaoVeiculo_condutorId_fkey" FOREIGN KEY ("condutorId") REFERENCES "rh"."Condutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."Infracao" ADD CONSTRAINT "Infracao_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."Infracao" ADD CONSTRAINT "Infracao_condutorIndicadoId_fkey" FOREIGN KEY ("condutorIndicadoId") REFERENCES "rh"."Condutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."DocumentoVeiculo" ADD CONSTRAINT "DocumentoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."TransferenciaVeiculo" ADD CONSTRAINT "TransferenciaVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."ConsumoVeiculo" ADD CONSTRAINT "ConsumoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."ConsumoVeiculo" ADD CONSTRAINT "ConsumoVeiculo_condutorId_fkey" FOREIGN KEY ("condutorId") REFERENCES "rh"."Condutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."ManutencaoVeiculo" ADD CONSTRAINT "ManutencaoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "rh"."Veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
