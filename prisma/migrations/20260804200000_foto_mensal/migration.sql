-- Foto mensal: snapshot histórico de headcount, admissões, desligamentos e
-- folha, por competência × CNPJ × setor × cargo.
--
-- Até aqui o "histórico de 12 meses" do Painel era RECONSTRUÍDO a partir de
-- campos que o RH edita todo dia (lib/bi.ts::calcularTurnover deduz o
-- headcount inicial de trás para frente, na falta de snapshot). Consequência:
-- corrigir uma data de desligamento reescreve o passado, e o mesmo gráfico dá
-- dois números em dias diferentes.
--
-- Puramente ADITIVA: cria uma tabela nova e não toca em nenhuma existente.
CREATE TABLE "rh"."FotoMensal" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "empresaNome" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "marcaNome" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "setorNome" TEXT NOT NULL,
    "posicaoId" TEXT NOT NULL,
    "posicaoNome" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "admissoes" INTEGER NOT NULL,
    "desligamentos" INTEGER NOT NULL,
    "headcountSemDataAdmissao" INTEGER NOT NULL,
    "desligadosSemDataAcumulado" INTEGER NOT NULL,
    "folhaSalarial" DOUBLE PRECISION,
    "comSalario" INTEGER NOT NULL,
    "semSalario" INTEGER NOT NULL,
    "capturadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versaoApp" TEXT NOT NULL,

    CONSTRAINT "FotoMensal_pkey" PRIMARY KEY ("id")
);

-- "A série inteira do grupo neste mês".
CREATE INDEX "FotoMensal_competencia_idx" ON "rh"."FotoMensal"("competencia");

-- "A série deste CNPJ ao longo do tempo" — o recorte de toda tela do módulo,
-- que sempre chega com empresaId de empresasVisiveis().
CREATE INDEX "FotoMensal_empresaId_competencia_idx" ON "rh"."FotoMensal"("empresaId", "competencia");

-- O contrato de idempotência do cron: com esta trava, rodar a captura duas
-- vezes na mesma competência não duplica nem sobrescreve — a segunda passada
-- colide e é descartada (`createMany({ skipDuplicates: true })`). As quatro
-- colunas são NOT NULL de propósito: em Postgres NULL não colide com NULL, e
-- uma delas opcional transformaria a trava em sugestão.
CREATE UNIQUE INDEX "FotoMensal_competencia_empresaId_setorId_posicaoId_key" ON "rh"."FotoMensal"("competencia", "empresaId", "setorId", "posicaoId");

-- Não há FOREIGN KEY para Empresa/Marca/Setor/Posicao de propósito: as
-- referências são SOFT (id + snapshot do nome), o mesmo padrão da trilha de
-- auditoria deste schema. Um snapshot que quebra — ou que muda de rótulo —
-- porque o RH apagou um cargo dois anos depois não é snapshot.
