"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tipoContratoLabel } from "@/lib/constants-dp";
import { formatarData, tempoDeCasa } from "@/lib/datas";
import type { ResumoFerias } from "@/lib/ferias";
import type { ConformidadeColaborador, SituacaoExame } from "@/lib/conformidade";
import { AtivarDesativarButton } from "../ativar-desativar-button";
import { FichaBlocos } from "./ficha-blocos";
import { DependentesCard } from "./dependentes-card";
import { DocumentosCard } from "./documentos-card";
import { FeriasCard } from "./ferias-card";
import { AusenciasCard } from "./ausencias-card";
import { SegurancaCard } from "./seguranca-card";
import { MovimentacoesCard } from "./movimentacoes-card";
import { BeneficiosCard } from "./beneficios-card";
import { EpisCard } from "./epis-card";
import { AcidentesCard } from "./acidentes-card";
import { OffboardingCard } from "./offboarding-card";
import { DesempenhoCard } from "./desempenho-card";
import { MetasPdiCard } from "./metas-pdi-card";
import { TreinamentosCard } from "./treinamentos-card";
import { IntegracaoCard } from "./integracao-card";
import { DisciplinarCard } from "./disciplinar-card";

type Colaborador = Parameters<typeof FichaBlocos>[0]["colaborador"] & {
  ativo: boolean;
  telegramChatId: string | null;
  checklistDispensado: boolean;
  checklistDispensadoEm: Date | null;
  checklistDispensadoPorNome: string | null;
};

export function ColaboradorDetalhe({
  empresaId,
  colaborador,
  dependentes,
  documentos,
  ferias,
  ausencias,
  resumoFerias,
  conformidade,
  certificados,
  exames,
  situacaoExame,
  setores,
  posicoes,
  candidatosSupervisor,
  movimentacoes,
  beneficios,
  tiposBeneficioCustom,
  dependentesNoPlanoSaude,
  entregasEpi,
  tiposEpiDisponiveis,
  motivosEntregaDisponiveis,
  acidentes,
  ausenciasElegiveisAcidente,
  tiposAcidenteDisponiveis,
  tiposMovimentacaoDisponiveis,
  checklistDesligamento,
  entrevistaDesligamento,
  avaliacoes,
  competenciasDisponiveis,
  metas,
  statusMetaDisponiveis,
  pdi,
  participacoesTreinamento,
  treinamentosAtivos,
  admissao,
  checklistIntegracao,
  ocorrenciasDisciplinares,
}: {
  empresaId: string;
  colaborador: Colaborador;
  dependentes: Parameters<typeof DependentesCard>[0]["dependentes"];
  documentos: Parameters<typeof DocumentosCard>[0]["documentos"];
  ferias: Parameters<typeof FeriasCard>[0]["solicitacoes"];
  ausencias: Parameters<typeof AusenciasCard>[0]["ausencias"];
  resumoFerias: ResumoFerias | null;
  conformidade: ConformidadeColaborador;
  certificados: Parameters<typeof SegurancaCard>[0]["certificados"];
  exames: Parameters<typeof SegurancaCard>[0]["exames"];
  situacaoExame: SituacaoExame;
  setores: Parameters<typeof MovimentacoesCard>[0]["setores"];
  posicoes: Parameters<typeof MovimentacoesCard>[0]["posicoes"];
  candidatosSupervisor: Parameters<typeof MovimentacoesCard>[0]["candidatosSupervisor"];
  movimentacoes: Parameters<typeof MovimentacoesCard>[0]["movimentacoes"];
  beneficios: Parameters<typeof BeneficiosCard>[0]["beneficios"];
  tiposBeneficioCustom: Parameters<typeof BeneficiosCard>[0]["tiposBeneficioCustom"];
  dependentesNoPlanoSaude: number;
  entregasEpi: Parameters<typeof EpisCard>[0]["entregas"];
  tiposEpiDisponiveis: Parameters<typeof EpisCard>[0]["tiposEpiDisponiveis"];
  motivosEntregaDisponiveis: Parameters<typeof EpisCard>[0]["motivosEntregaDisponiveis"];
  acidentes: Parameters<typeof AcidentesCard>[0]["acidentes"];
  ausenciasElegiveisAcidente: Parameters<typeof AcidentesCard>[0]["ausenciasElegiveis"];
  tiposAcidenteDisponiveis: Parameters<typeof AcidentesCard>[0]["tiposAcidenteDisponiveis"];
  tiposMovimentacaoDisponiveis: Parameters<typeof MovimentacoesCard>[0]["tiposMovimentacaoDisponiveis"];
  checklistDesligamento: Parameters<typeof OffboardingCard>[0]["checklist"];
  entrevistaDesligamento: Parameters<typeof OffboardingCard>[0]["entrevista"];
  avaliacoes: Parameters<typeof DesempenhoCard>[0]["avaliacoes"];
  competenciasDisponiveis: Parameters<typeof DesempenhoCard>[0]["competenciasDisponiveis"];
  metas: Parameters<typeof MetasPdiCard>[0]["metas"];
  statusMetaDisponiveis: Parameters<typeof MetasPdiCard>[0]["statusMetaDisponiveis"];
  pdi: Parameters<typeof MetasPdiCard>[0]["pdi"];
  participacoesTreinamento: Parameters<typeof TreinamentosCard>[0]["participacoes"];
  treinamentosAtivos: Parameters<typeof TreinamentosCard>[0]["treinamentosAtivos"];
  admissao: {
    vaga: { id: string; titulo: string };
    pendencias: { chave: string; descricao: string }[];
  } | null;
  checklistIntegracao: Parameters<typeof IntegracaoCard>[0]["itens"];
  ocorrenciasDisciplinares: Parameters<typeof DisciplinarCard>[0]["ocorrencias"];
}) {
  const pendencias =
    ferias.filter((f) => f.status === "PENDENTE").length +
    ausencias.filter((a) => a.status === "PENDENTE").length;
  const irregular = !conformidade.regular || situacaoExame.situacao === "VENCIDO" || situacaoExame.situacao === "NUNCA_FEITO";

  // Se vier com ?tab=ferias na URL, abre direto nessa aba
  const searchParams = useSearchParams();
  const abaPadrao = (searchParams.get("tab") ?? "ficha") as string;

  return (
    <div className="space-y-6">
      <Link
        href={`/rh/${empresaId}/colaboradores`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Colaboradores
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{colaborador.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {colaborador.setor.nome} · {colaborador.posicao.nome}
            {colaborador.matricula && ` · matrícula ${colaborador.matricula}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={colaborador.ativo ? "default" : "secondary"}>
            {colaborador.ativo ? "Ativo" : "Inativo"}
          </Badge>
          <AtivarDesativarButton
            empresaId={empresaId}
            id={colaborador.id}
            ativo={colaborador.ativo}
            comRotulo
          />
          {colaborador.tipoContrato && (
            <Badge variant="outline">{tipoContratoLabel(colaborador.tipoContrato)}</Badge>
          )}
          {colaborador.telegramChatId && <Badge variant="secondary">Telegram vinculado</Badge>}
          {resumoFerias?.temVencido && <Badge variant="destructive">Férias vencidas</Badge>}
          {!resumoFerias?.temVencido && resumoFerias?.temVencendo && (
            <Badge variant="secondary">Férias vencendo</Badge>
          )}
          {irregular && <Badge variant="destructive">Irregular (SST)</Badge>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo label="Admissão" valor={formatarData(colaborador.dataAdmissao)} />
        <Resumo
          label="Tempo de casa"
          valor={colaborador.dataAdmissao ? tempoDeCasa(colaborador.dataAdmissao) : "—"}
        />
        <Resumo
          label="Saldo de férias"
          valor={resumoFerias ? `${resumoFerias.saldoDisponivel} dias` : "—"}
        />
        <Resumo label="Pendências de aprovação" valor={pendencias > 0 ? `${pendencias}` : "nenhuma"} />
      </div>

      {admissao && admissao.pendencias.length > 0 && (
        <Alert>
          <ClipboardList className="size-4" />
          <AlertDescription>
            <span className="font-medium">
              Admissão pela vaga{" "}
              <Link href={`/rh/${empresaId}/vagas/${admissao.vaga.id}`} className="underline">
                {admissao.vaga.titulo}
              </Link>{" "}
              — {admissao.pendencias.length} pendência(s):
            </span>
            <ul className="mt-1 list-inside list-disc text-sm">
              {admissao.pendencias.map((p) => (
                <li key={p.chave}>{p.descricao}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={abaPadrao} className="w-full">
        <TabsList
          variant="line"
          className="w-full flex-col h-auto bg-muted/20 rounded-lg p-2 gap-2 border"
        >
          <div className="flex w-full items-center justify-between gap-1">
            <TabsTrigger value="ficha" className="flex-1 justify-center text-xs py-1.5 px-1">
              Ficha
            </TabsTrigger>
            <TabsTrigger value="dependentes" className="flex-1 justify-center text-xs py-1.5 px-1">
              Dependentes ({dependentes.length})
            </TabsTrigger>
            <TabsTrigger value="dossie" className="flex-1 justify-center text-xs py-1.5 px-1">
              Dossiê ({documentos.length})
            </TabsTrigger>
            <TabsTrigger value="ferias" className="flex-1 justify-center text-xs py-1.5 px-1">
              Férias
            </TabsTrigger>
            <TabsTrigger value="ausencias" className="flex-1 justify-center text-xs py-1.5 px-1">
              Ausências ({ausencias.length})
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="flex-1 justify-center text-xs py-1.5 px-1">
              Segurança {irregular && <Badge variant="destructive" className="ml-1 px-1 py-0 text-[10px]">!</Badge>}
            </TabsTrigger>
            <TabsTrigger value="carreira" className="flex-1 justify-center text-xs py-1.5 px-1">
              Carreira ({movimentacoes.length})
            </TabsTrigger>
            <TabsTrigger value="beneficios" className="flex-1 justify-center text-xs py-1.5 px-1">
              Benefícios ({beneficios.length})
            </TabsTrigger>
          </div>
          <div className="flex w-full items-center justify-between gap-1">
            <TabsTrigger value="epis" className="flex-1 justify-center text-xs py-1.5 px-1">
              EPIs ({entregasEpi.length})
            </TabsTrigger>
            <TabsTrigger value="acidentes" className="flex-1 justify-center text-xs py-1.5 px-1">
              Acidentes ({acidentes.length})
            </TabsTrigger>
            <TabsTrigger value="desempenho" className="flex-1 justify-center text-xs py-1.5 px-1">
              Desempenho ({avaliacoes.length})
            </TabsTrigger>
            <TabsTrigger value="metas-pdi" className="flex-1 justify-center text-xs py-1.5 px-1">
              Metas &amp; PDI
            </TabsTrigger>
            <TabsTrigger value="treinamentos" className="flex-1 justify-center text-xs py-1.5 px-1">
              Treinamentos ({participacoesTreinamento.length})
            </TabsTrigger>
            <TabsTrigger value="disciplinar" className="flex-1 justify-center text-xs py-1.5 px-1">
              Disciplinar ({ocorrenciasDisciplinares.length})
            </TabsTrigger>
            {colaborador.ativo && (
              <TabsTrigger value="integracao" className="flex-1 justify-center text-xs py-1.5 px-1">
                Integração
              </TabsTrigger>
            )}
            {colaborador.dataDesligamento && (
              <TabsTrigger value="desligamento" className="flex-1 justify-center text-xs py-1.5 px-1">
                Desligamento
              </TabsTrigger>
            )}
          </div>
        </TabsList>

        <TabsContent value="ficha" className="pt-4">
          <FichaBlocos
            empresaId={empresaId}
            colaborador={colaborador}
            setores={setores}
            posicoes={posicoes}
            candidatosSupervisor={candidatosSupervisor}
          />
        </TabsContent>
        <TabsContent value="dependentes" className="pt-4">
          <DependentesCard empresaId={empresaId} colaboradorId={colaborador.id} dependentes={dependentes} />
        </TabsContent>
        <TabsContent value="dossie" className="pt-4">
          <DocumentosCard empresaId={empresaId} colaboradorId={colaborador.id} documentos={documentos} />
        </TabsContent>
        <TabsContent value="ferias" className="pt-4">
          <FeriasCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            solicitacoes={ferias}
            resumo={resumoFerias}
          />
        </TabsContent>
        <TabsContent value="ausencias" className="pt-4">
          <AusenciasCard empresaId={empresaId} colaboradorId={colaborador.id} ausencias={ausencias} />
        </TabsContent>
        <TabsContent value="seguranca" className="pt-4">
          <SegurancaCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            posicaoNome={colaborador.posicao.nome}
            conformidade={conformidade}
            certificados={certificados}
            exames={exames}
            situacaoExame={situacaoExame}
          />
        </TabsContent>
        <TabsContent value="carreira" className="pt-4">
          <MovimentacoesCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            setorAtualNome={colaborador.setor.nome}
            posicaoAtualNome={colaborador.posicao.nome}
            supervisorAtual={colaborador.supervisor}
            setores={setores}
            posicoes={posicoes}
            candidatosSupervisor={candidatosSupervisor}
            movimentacoes={movimentacoes}
            tiposMovimentacaoDisponiveis={tiposMovimentacaoDisponiveis}
          />
        </TabsContent>
        <TabsContent value="beneficios" className="pt-4">
          <BeneficiosCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            beneficios={beneficios}
            tiposBeneficioCustom={tiposBeneficioCustom}
            temDependentesNoPlano={dependentesNoPlanoSaude}
          />
        </TabsContent>
        <TabsContent value="epis" className="pt-4">
          <EpisCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            entregas={entregasEpi}
            tiposEpiDisponiveis={tiposEpiDisponiveis}
            motivosEntregaDisponiveis={motivosEntregaDisponiveis}
          />
        </TabsContent>
        <TabsContent value="acidentes" className="pt-4">
          <AcidentesCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            acidentes={acidentes}
            ausenciasElegiveis={ausenciasElegiveisAcidente}
            tiposAcidenteDisponiveis={tiposAcidenteDisponiveis}
          />
        </TabsContent>
        <TabsContent value="desempenho" className="pt-4">
          <DesempenhoCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            avaliacoes={avaliacoes}
            competenciasDisponiveis={competenciasDisponiveis}
          />
        </TabsContent>
        <TabsContent value="metas-pdi" className="pt-4">
          <MetasPdiCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            metas={metas}
            pdi={pdi}
            statusMetaDisponiveis={statusMetaDisponiveis}
          />
        </TabsContent>
        <TabsContent value="treinamentos" className="pt-4">
          <TreinamentosCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            participacoes={participacoesTreinamento}
            treinamentosAtivos={treinamentosAtivos}
          />
        </TabsContent>
        <TabsContent value="disciplinar" className="pt-4">
          <DisciplinarCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            ocorrencias={ocorrenciasDisciplinares}
          />
        </TabsContent>
        {colaborador.ativo && (
          <TabsContent value="integracao" className="pt-4">
            <IntegracaoCard
              empresaId={empresaId}
              colaboradorId={colaborador.id}
              itens={checklistIntegracao}
            />
          </TabsContent>
        )}
        {colaborador.dataDesligamento && (
          <TabsContent value="desligamento" className="pt-4">
            <OffboardingCard
              empresaId={empresaId}
              colaboradorId={colaborador.id}
              dataDesligamento={colaborador.dataDesligamento}
              motivoDesligamento={colaborador.motivoDesligamento}
              checklistDispensado={colaborador.checklistDispensado}
              checklistDispensadoEm={colaborador.checklistDispensadoEm}
              checklistDispensadoPorNome={colaborador.checklistDispensadoPorNome}
              checklist={checklistDesligamento}
              entrevista={entrevistaDesligamento}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
