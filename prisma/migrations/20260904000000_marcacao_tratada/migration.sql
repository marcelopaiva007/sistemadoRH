-- Marcação de ponto incluída por decisão do RH (PTRP). Até aqui, aprovar um
-- TratamentoPonto de INCLUSAO_MANUAL só trocava o status do pedido: nada
-- virava marcação, e em 03/09/2026 a produção tinha 28 pedidos APROVADOS que
-- não existiam nem para o monitor de presença nem para o AEJ.
--
-- Tabela PRÓPRIA, de propósito. RegistroPonto é o que o REP-P coletou — a única
-- fonte do AFD (Portaria MTP 671/2021) — e continua intocado, sem UPDATE nem
-- INSERT por decisão humana. Marcação decidida pelo RH é jornada TRATADA: vai
-- para o AEJ, painel e apuração, nunca para o AFD, e não consome NSR.
--
-- tratamentoId é UNIQUE: um tratamento aprovado gera UMA marcação — é o que
-- barra o duplo clique na aprovação e a re-execução do backfill. A FK para
-- TratamentoPonto é NO ACTION (não RESTRICT): NO ACTION é conferido no fim do
-- statement, então o cascade da exclusão de ficha (Colaborador -> TratamentoPonto
-- e Colaborador -> MarcacaoTratada) continua funcionando; RESTRICT quebraria
-- deleteColaborador.
--
-- Puramente aditiva: tabela nova, nenhum dado tocado. Os 28 aprovados antigos
-- NÃO são convertidos aqui — quem faz isso, com relatório e auditoria por
-- linha, é scripts/materializar-tratamentos-aprovados.ts (--executar).

-- CreateTable
CREATE TABLE "rh"."MarcacaoTratada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tratamentoId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "aprovadoPorId" TEXT,
    "aprovadoPorNome" TEXT,
    "aprovadoEm" TIMESTAMP(3) NOT NULL,
    "hashSHA256" TEXT NOT NULL,
    "origemRegistro" TEXT NOT NULL DEFAULT 'DECISAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarcacaoTratada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarcacaoTratada_tratamentoId_key" ON "rh"."MarcacaoTratada"("tratamentoId");

-- CreateIndex
CREATE INDEX "MarcacaoTratada_empresaId_dataHora_idx" ON "rh"."MarcacaoTratada"("empresaId", "dataHora");

-- CreateIndex
CREATE INDEX "MarcacaoTratada_colaboradorId_dataHora_idx" ON "rh"."MarcacaoTratada"("colaboradorId", "dataHora");

-- AddForeignKey
ALTER TABLE "rh"."MarcacaoTratada" ADD CONSTRAINT "MarcacaoTratada_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "rh"."Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh"."MarcacaoTratada" ADD CONSTRAINT "MarcacaoTratada_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "rh"."TratamentoPonto"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
