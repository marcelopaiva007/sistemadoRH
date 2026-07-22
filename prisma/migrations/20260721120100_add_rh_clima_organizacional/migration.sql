-- AlterTable
ALTER TABLE "User" ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "setorId" TEXT;

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posicao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "setorId" TEXT NOT NULL,
    "posicaoId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pesquisa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "anonima" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "iniciadaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),

    CONSTRAINT "Pesquisa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pergunta" (
    "id" TEXT NOT NULL,
    "pesquisaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "enunciado" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'LIKERT_5',
    "dimensaoGPTW" TEXT,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Pergunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opcao" (
    "id" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "Opcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyToken" (
    "id" TEXT NOT NULL,
    "pesquisaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "enviadoEm" TIMESTAMP(3),
    "respondidoEm" TIMESTAMP(3),
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resposta" (
    "id" TEXT NOT NULL,
    "pesquisaId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "setorNomeSnapshot" TEXT NOT NULL,
    "posicaoNomeSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaItem" (
    "id" TEXT NOT NULL,
    "respostaId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "valorNumerico" INTEGER,
    "valorTexto" TEXT,
    "opcaoId" TEXT,

    CONSTRAINT "RespostaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_nome_key" ON "Empresa"("nome");

-- CreateIndex
CREATE INDEX "Setor_empresaId_idx" ON "Setor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Setor_empresaId_nome_key" ON "Setor"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Posicao_empresaId_idx" ON "Posicao"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Posicao_empresaId_nome_key" ON "Posicao"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Colaborador_empresaId_idx" ON "Colaborador"("empresaId");

-- CreateIndex
CREATE INDEX "Colaborador_setorId_idx" ON "Colaborador"("setorId");

-- CreateIndex
CREATE INDEX "Colaborador_posicaoId_idx" ON "Colaborador"("posicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_empresaId_cpf_key" ON "Colaborador"("empresaId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_telegramChatId_key" ON "Colaborador"("telegramChatId");

-- CreateIndex
CREATE INDEX "Pesquisa_empresaId_status_idx" ON "Pesquisa"("empresaId", "status");

-- CreateIndex
CREATE INDEX "Pergunta_pesquisaId_idx" ON "Pergunta"("pesquisaId");

-- CreateIndex
CREATE UNIQUE INDEX "Pergunta_pesquisaId_ordem_key" ON "Pergunta"("pesquisaId", "ordem");

-- CreateIndex
CREATE INDEX "Opcao_perguntaId_idx" ON "Opcao"("perguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyToken_token_key" ON "SurveyToken"("token");

-- CreateIndex
CREATE INDEX "SurveyToken_status_idx" ON "SurveyToken"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyToken_pesquisaId_colaboradorId_key" ON "SurveyToken"("pesquisaId", "colaboradorId");

-- CreateIndex
CREATE INDEX "Resposta_pesquisaId_idx" ON "Resposta"("pesquisaId");

-- CreateIndex
CREATE INDEX "RespostaItem_respostaId_idx" ON "RespostaItem"("respostaId");

-- CreateIndex
CREATE INDEX "RespostaItem_perguntaId_idx" ON "RespostaItem"("perguntaId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setor" ADD CONSTRAINT "Setor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posicao" ADD CONSTRAINT "Posicao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_posicaoId_fkey" FOREIGN KEY ("posicaoId") REFERENCES "Posicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pesquisa" ADD CONSTRAINT "Pesquisa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pesquisa" ADD CONSTRAINT "Pesquisa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pergunta" ADD CONSTRAINT "Pergunta_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "Pesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opcao" ADD CONSTRAINT "Opcao_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "Pergunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyToken" ADD CONSTRAINT "SurveyToken_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "Pesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyToken" ADD CONSTRAINT "SurveyToken_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resposta" ADD CONSTRAINT "Resposta_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "Pesquisa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resposta" ADD CONSTRAINT "Resposta_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaItem" ADD CONSTRAINT "RespostaItem_respostaId_fkey" FOREIGN KEY ("respostaId") REFERENCES "Resposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaItem" ADD CONSTRAINT "RespostaItem_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "Pergunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaItem" ADD CONSTRAINT "RespostaItem_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "Opcao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

