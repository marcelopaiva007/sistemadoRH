-- Fase 1 do roadmap de RH — Departamento Pessoal.
--
-- Aditiva: só cria colunas/tabelas novas no schema `rh`. Nenhuma coluna ou
-- tabela existente é alterada ou removida, então roda com o app no ar.
--
-- Entrega:
--   * Colaborador       -> ficha completa (documentos, endereço, emergência,
--                          dados bancários, vínculo/admissão)
--   * Dependente        -> dependentes por colaborador (IRRF, salário-família)
--   * Arquivo           -> conteúdo binário dos anexos (bytea), tabela separada
--                          dos metadados para listagens nunca carregarem o blob
--   * DocumentoColaborador -> dossiê digital com validade (painel de vencimentos)
--   * SolicitacaoFerias -> pedidos de férias (períodos aquisitivos são
--                          derivados em lib/ferias.ts, não materializados)
--   * Ausencia          -> atestados, faltas, licenças e afastamentos
--   * AuditLog          -> trilha de auditoria LGPD (append-only)
--
-- Também cria os índices declarados no cutover de 24/07/2026 que ainda não
-- existiam no banco (Pesquisa.criadoPorId, RespostaItem.opcaoId, User.empresaId,
-- User.setorId).
--
-- Escrita com IF NOT EXISTS / guardas de constraint: pode ser reaplicada sem
-- erro, já que neste projeto o SQL é aplicado à mão (os apps dividem a tabela
-- _prisma_migrations — ver README, "Notas sobre o banco").

-- AlterTable: ficha completa do colaborador
ALTER TABLE "rh"."Colaborador"
  ADD COLUMN IF NOT EXISTS "matricula" TEXT,
  ADD COLUMN IF NOT EXISTS "rg" TEXT,
  ADD COLUMN IF NOT EXISTS "rgOrgaoEmissor" TEXT,
  ADD COLUMN IF NOT EXISTS "rgUf" TEXT,
  ADD COLUMN IF NOT EXISTS "pis" TEXT,
  ADD COLUMN IF NOT EXISTS "ctpsNumero" TEXT,
  ADD COLUMN IF NOT EXISTS "ctpsSerie" TEXT,
  ADD COLUMN IF NOT EXISTS "ctpsUf" TEXT,
  ADD COLUMN IF NOT EXISTS "tituloEleitor" TEXT,
  ADD COLUMN IF NOT EXISTS "estadoCivil" TEXT,
  ADD COLUMN IF NOT EXISTS "escolaridade" TEXT,
  ADD COLUMN IF NOT EXISTS "nomeMae" TEXT,
  ADD COLUMN IF NOT EXISTS "nomePai" TEXT,
  ADD COLUMN IF NOT EXISTS "nacionalidade" TEXT,
  ADD COLUMN IF NOT EXISTS "naturalidade" TEXT,
  ADD COLUMN IF NOT EXISTS "cep" TEXT,
  ADD COLUMN IF NOT EXISTS "logradouro" TEXT,
  ADD COLUMN IF NOT EXISTS "numeroEndereco" TEXT,
  ADD COLUMN IF NOT EXISTS "complemento" TEXT,
  ADD COLUMN IF NOT EXISTS "bairro" TEXT,
  ADD COLUMN IF NOT EXISTS "uf" TEXT,
  ADD COLUMN IF NOT EXISTS "emergenciaNome" TEXT,
  ADD COLUMN IF NOT EXISTS "emergenciaParentesco" TEXT,
  ADD COLUMN IF NOT EXISTS "emergenciaTelefone" TEXT,
  ADD COLUMN IF NOT EXISTS "bancoNome" TEXT,
  ADD COLUMN IF NOT EXISTS "bancoAgencia" TEXT,
  ADD COLUMN IF NOT EXISTS "bancoConta" TEXT,
  ADD COLUMN IF NOT EXISTS "bancoTipoConta" TEXT,
  ADD COLUMN IF NOT EXISTS "chavePix" TEXT,
  ADD COLUMN IF NOT EXISTS "dataAdmissao" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dataDesligamento" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "motivoDesligamento" TEXT,
  ADD COLUMN IF NOT EXISTS "tipoContrato" TEXT,
  ADD COLUMN IF NOT EXISTS "jornadaSemanal" INTEGER,
  ADD COLUMN IF NOT EXISTS "salarioBase" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Dependente" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "cpf" TEXT,
    "irrf" BOOLEAN NOT NULL DEFAULT false,
    "salarioFamilia" BOOLEAN NOT NULL DEFAULT false,
    "planoSaude" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dependente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Arquivo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."DocumentoColaborador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "emitidoEm" TIMESTAMP(3),
    "validoAte" TIMESTAMP(3),
    "observacoes" TEXT,
    "arquivoId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."SolicitacaoFerias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "periodoAquisitivoInicio" TIMESTAMP(3) NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL,
    "diasAbono" INTEGER NOT NULL DEFAULT 0,
    "decimoAntecipado" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "solicitadoPorId" TEXT,
    "solicitadoPorNome" TEXT,
    "decididoPorId" TEXT,
    "decididoPorNome" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitacaoFerias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."Ausencia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL,
    "abonada" BOOLEAN NOT NULL DEFAULT false,
    "cid" TEXT,
    "profissional" TEXT,
    "registroProfissional" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "arquivoId" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "decididoPorId" TEXT,
    "decididoPorNome" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rh"."AuditLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "usuarioRole" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "resumo" TEXT NOT NULL,
    "detalhes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Dependente_colaboradorId_idx" ON "rh"."Dependente"("colaboradorId");
CREATE INDEX IF NOT EXISTS "Arquivo_empresaId_idx" ON "rh"."Arquivo"("empresaId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoColaborador_arquivoId_key" ON "rh"."DocumentoColaborador"("arquivoId");
CREATE INDEX IF NOT EXISTS "DocumentoColaborador_colaboradorId_idx" ON "rh"."DocumentoColaborador"("colaboradorId");
CREATE INDEX IF NOT EXISTS "DocumentoColaborador_empresaId_validoAte_idx" ON "rh"."DocumentoColaborador"("empresaId", "validoAte");
CREATE INDEX IF NOT EXISTS "SolicitacaoFerias_empresaId_status_idx" ON "rh"."SolicitacaoFerias"("empresaId", "status");
CREATE INDEX IF NOT EXISTS "SolicitacaoFerias_colaboradorId_status_idx" ON "rh"."SolicitacaoFerias"("colaboradorId", "status");
CREATE INDEX IF NOT EXISTS "SolicitacaoFerias_empresaId_dataInicio_idx" ON "rh"."SolicitacaoFerias"("empresaId", "dataInicio");
CREATE UNIQUE INDEX IF NOT EXISTS "Ausencia_arquivoId_key" ON "rh"."Ausencia"("arquivoId");
CREATE INDEX IF NOT EXISTS "Ausencia_empresaId_status_idx" ON "rh"."Ausencia"("empresaId", "status");
CREATE INDEX IF NOT EXISTS "Ausencia_colaboradorId_dataInicio_idx" ON "rh"."Ausencia"("colaboradorId", "dataInicio");
CREATE INDEX IF NOT EXISTS "Ausencia_empresaId_dataInicio_idx" ON "rh"."Ausencia"("empresaId", "dataInicio");
CREATE INDEX IF NOT EXISTS "AuditLog_empresaId_createdAt_idx" ON "rh"."AuditLog"("empresaId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entidade_entidadeId_idx" ON "rh"."AuditLog"("entidade", "entidadeId");
CREATE INDEX IF NOT EXISTS "Colaborador_empresaId_dataAdmissao_idx" ON "rh"."Colaborador"("empresaId", "dataAdmissao");

-- CreateIndex: declarados no cutover de 24/07/2026, ainda ausentes no banco
CREATE INDEX IF NOT EXISTS "Pesquisa_criadoPorId_idx" ON "rh"."Pesquisa"("criadoPorId");
CREATE INDEX IF NOT EXISTS "RespostaItem_opcaoId_idx" ON "rh"."RespostaItem"("opcaoId");
CREATE INDEX IF NOT EXISTS "User_empresaId_idx" ON "shared"."User"("empresaId");
CREATE INDEX IF NOT EXISTS "User_setorId_idx" ON "shared"."User"("setorId");

-- AddForeignKey (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE "rh"."Dependente" ADD CONSTRAINT "Dependente_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."DocumentoColaborador" ADD CONSTRAINT "DocumentoColaborador_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."DocumentoColaborador" ADD CONSTRAINT "DocumentoColaborador_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."SolicitacaoFerias" ADD CONSTRAINT "SolicitacaoFerias_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Ausencia" ADD CONSTRAINT "Ausencia_colaboradorId_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "rh"."Ausencia" ADD CONSTRAINT "Ausencia_arquivoId_fkey"
    FOREIGN KEY ("arquivoId") REFERENCES "rh"."Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
