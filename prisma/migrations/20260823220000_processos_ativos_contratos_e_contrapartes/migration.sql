-- Módulo Processos & Ativos — onda 1, parte 2: contratos e contrapartes
-- (23/08/2026). Base: `estudo-modulo-processos-ativos.md`, seção 6.3 e 6.7.
--
-- PURAMENTE ADITIVA: duas tabelas novas (Contraparte, Contrato), nenhum ALTER
-- em tabela existente, nenhum dado tocado. Sobe sozinha, sem tela — mesmo
-- motivo da migration da frota: `prisma/checar-migracoes.mjs` derruba o build de Preview de qualquer
-- branch com migration pendente, e uma PR que trouxesse tabela E tela juntas
-- ficaria sem endereço de teste na Vercel.
--
-- Escopo DELIBERADAMENTE menor que o "CLM completo" do estudo — decisão de
-- modelagem, não corte por pressa:
--   - Sem Aditivo/Garantia/Notificacao/ContratoVersao/ContratoAprovacao/
--     ContratoAssinatura como tabelas próprias. É o antipadrão nº 5 do
--     próprio estudo ("big bang de 5 domínios"), agora dentro de 1 domínio.
--   - `Contrato` é UMA tabela plana (vigência + financeiro + jurídico juntos),
--     não 4 tabelas 1:1. Veiculo e Infracao já estabeleceram esse padrão no
--     módulo, e a tela não pede a normalização extra.
--   - SEM controle de certidão de fornecedor (DocumentoTerceiro e o histórico
--     de cobrança). O estudo recomenda, e o CEO tinha decidido em 23/08/2026
--     como "só alerta, não bloqueia" — mas no mesmo dia, ao revisar o escopo,
--     decidiu NÃO desenvolver: o grupo não vai usar. Tabela criada e nunca
--     preenchida é pior que tabela ausente — ela faz o próximo a ler o schema
--     acreditar que o controle existe. Se voltar, volta como migration nova.
--   - Preço regulado (compartilhamento de poste, Res. Conjunta ANEEL/ANATEL
--     4/2014) NUNCA é hard-coded — só a contagem de pontos entra no schema,
--     o valor é o que está escrito no contrato real.
--
-- Prazos-alvo materializados: dataLimiteDenuncia, janelaRenovatoriaInicio/Fim
-- (Lei 8.245/1991, art. 51 §5º — decadência do direito de ação renovatória,
-- não suspende nem interrompe) e proximoReajuste (periodicidade validada
-- ≥12 meses na action — Lei 10.192/2001, art. 2º §1º: cláusula de reajuste
-- mais curta é NULA de pleno direito).

-- CreateTable
CREATE TABLE "rh"."Contraparte" (
    "id" TEXT NOT NULL,
    "tipoPessoa" TEXT NOT NULL DEFAULT 'JURIDICA',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpjCpf" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "endereco" TEXT,
    "emailNotificacaoFormal" TEXT,
    "telefone" TEXT,
    "papeis" TEXT NOT NULL,
    "criticidade" TEXT NOT NULL DEFAULT 'NORMAL',
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contraparte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh"."Contrato" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "contraparteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'DESPESA',
    "titulo" TEXT NOT NULL,
    "objeto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VIGENTE',
    "criticidade" TEXT NOT NULL DEFAULT 'NORMAL',
    "gestorId" TEXT,
    "gestorNome" TEXT,
    "setorId" TEXT,
    "dataAssinatura" TIMESTAMP(3),
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "indeterminado" BOOLEAN NOT NULL DEFAULT false,
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "avisoPrevioNaoRenovacaoDias" INTEGER,
    "dataLimiteDenuncia" TIMESTAMP(3),
    "locacaoNaoResidencial" BOOLEAN NOT NULL DEFAULT false,
    "janelaRenovatoriaInicio" TIMESTAMP(3),
    "janelaRenovatoriaFim" TIMESTAMP(3),
    "buildToSuit" BOOLEAN NOT NULL DEFAULT false,
    "renunciaRevisionalPactuada" BOOLEAN NOT NULL DEFAULT false,
    "valorMensal" DOUBLE PRECISION,
    "valorTotal" DOUBLE PRECISION,
    "indiceReajuste" TEXT,
    "periodicidadeReajusteMeses" INTEGER,
    "mesBaseReajuste" INTEGER,
    "proximoReajuste" TIMESTAMP(3),
    "multaCompensatoriaPct" DOUBLE PRECISION,
    "multaMoratoriaPct" DOUBLE PRECISION,
    "foroComarca" TEXT,
    "foroUf" TEXT,
    "lgpdAplicavel" BOOLEAN NOT NULL DEFAULT false,
    "pontosFixacaoContratados" INTEGER,
    "pontosFixacaoOcupados" INTEGER,
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contraparte_cnpjCpf_key" ON "rh"."Contraparte"("cnpjCpf");

-- CreateIndex
CREATE INDEX "Contrato_empresaId_status_idx" ON "rh"."Contrato"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Contrato_empresaId_dataLimiteDenuncia_idx" ON "rh"."Contrato"("empresaId", "dataLimiteDenuncia");

-- CreateIndex
CREATE INDEX "Contrato_empresaId_proximoReajuste_idx" ON "rh"."Contrato"("empresaId", "proximoReajuste");

-- CreateIndex
CREATE INDEX "Contrato_contraparteId_idx" ON "rh"."Contrato"("contraparteId");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_empresaId_numero_key" ON "rh"."Contrato"("empresaId", "numero");

-- AddForeignKey
ALTER TABLE "rh"."Contrato" ADD CONSTRAINT "Contrato_contraparteId_fkey" FOREIGN KEY ("contraparteId") REFERENCES "rh"."Contraparte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
