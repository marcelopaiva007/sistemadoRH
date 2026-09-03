"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FichaCabecalho, SubNav } from "@/components/padroes/ficha-com-subnav";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { Indicador } from "@/components/indicador";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { tipoContratoLabel } from "@/lib/constants-dp";
import { formatarData, tempoDeCasa } from "@/lib/datas";
import type { ResumoFerias } from "@/lib/ferias";
import type { ConformidadeColaborador, SituacaoExame } from "@/lib/conformidade";
import { AtivarDesativarButton } from "../ativar-desativar-button";
import { DesvincularTelegramButton } from "../desvincular-telegram-button";
import { CobrarCadastroButton } from "../cobrar-cadastro-button";
import { FichaBlocos } from "./ficha-blocos";
import { DependentesCard } from "./dependentes-card";
import { DocumentosCard } from "./documentos-card";
import { FeriasCard } from "./ferias-card";
import { AusenciasCard } from "./ausencias-card";
import { SegurancaCard } from "./seguranca-card";
import { MovimentacoesCard } from "./movimentacoes-card";
import { BeneficiosCard } from "./beneficios-card";
import { EpisCard } from "./epis-card";
import { EntregasCard } from "./entregas-card";
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

/** "Ana Carolina Ribeiro" → "AC". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

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
  entregas,
  tiposEntregaDisponiveis,
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
  cobrancaCadastro,
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
  entregas: Parameters<typeof EntregasCard>[0]["entregas"];
  tiposEntregaDisponiveis: Parameters<typeof EntregasCard>[0]["tiposEntregaDisponiveis"];
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
  cobrancaCadastro: { faltas: string[]; temCanal: boolean };
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

      <FichaCabecalho
        iniciais={iniciais(colaborador.nome)}
        titulo={colaborador.nome}
        contexto={
          <>
            {colaborador.setor.nome} · {colaborador.posicao.nome}
            {colaborador.matricula && ` · matrícula ${colaborador.matricula}`}
          </>
        }
        situacao={
          <>
            <Badge variant={colaborador.ativo ? "default" : "secondary"}>
              {colaborador.ativo ? "Ativo" : "Inativo"}
            </Badge>
            {colaborador.tipoContrato && (
              <Badge variant="secondary">{tipoContratoLabel(colaborador.tipoContrato)}</Badge>
            )}
            {colaborador.telegramChatId && <Badge variant="secondary">Telegram vinculado</Badge>}
            {resumoFerias?.temVencido && <Badge variant="destructive">Férias vencidas</Badge>}
            {!resumoFerias?.temVencido && resumoFerias?.temVencendo && (
              <Badge variant="outline">Férias vencendo</Badge>
            )}
            {irregular && <Badge variant="destructive">Irregular (SST)</Badge>}
          </>
        }
        acoes={
          // Os comandos da ficha atrás de um botão só: ativar/desativar,
          // desvincular Telegram e cobrar cadastro eram três botões soltos
          // disputando o cabeçalho com as tags de situação.
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Ações
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem closeOnClick={false}>
                <AtivarDesativarButton
                  empresaId={empresaId}
                  id={colaborador.id}
                  ativo={colaborador.ativo}
                  comRotulo
                />
              </DropdownMenuItem>
              {colaborador.telegramChatId && (
                <DropdownMenuItem closeOnClick={false}>
                  <DesvincularTelegramButton
                    empresaId={empresaId}
                    colaboradorId={colaborador.id}
                    nome={colaborador.nome}
                  />
                </DropdownMenuItem>
              )}
              {colaborador.ativo && cobrancaCadastro.faltas.length > 0 && cobrancaCadastro.temCanal && (
                <DropdownMenuItem closeOnClick={false}>
                  <CobrarCadastroButton empresaId={empresaId} colaboradorIds={[colaborador.id]} />
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <FaixaDeIndicadores>
        <Indicador rotulo="Admissão" valor={formatarData(colaborador.dataAdmissao)} />
        <Indicador
          rotulo="Tempo de casa"
          valor={colaborador.dataAdmissao ? tempoDeCasa(colaborador.dataAdmissao) : "—"}
        />
        <Indicador
          rotulo="Saldo de férias"
          valor={resumoFerias ? `${resumoFerias.saldoDisponivel} dias` : "—"}
        />
        <Indicador
          rotulo="Pendências de aprovação"
          valor={pendencias > 0 ? `${pendencias}` : "nenhuma"}
          estado={pendencias > 0 ? "alerta" : "padrao"}
        />
      </FaixaDeIndicadores>

      {/* O que a cobrança automática pediria a esta pessoa, com o botão de
          mandar agora. Só para quem está ativo: cobrar cadastro de desligado
          não tem destino. Sem canal, o alerta continua aparecendo (o RH precisa
          saber que a ficha está incompleta) e o botão dá lugar ao motivo. */}
      {colaborador.ativo && cobrancaCadastro.faltas.length > 0 && (
        <Alert>
          <Send className="size-4" />
          <AlertDescription>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="font-medium">
                  Cadastro incompleto — {cobrancaCadastro.faltas.length} item(ns) que o próprio colaborador resolve:
                </span>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {cobrancaCadastro.faltas.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              {cobrancaCadastro.temCanal ? (
                <CobrarCadastroButton empresaId={empresaId} colaboradorIds={[colaborador.id]} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Sem Telegram e sem e-mail — não há por onde cobrar.
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

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

      {/* 19 abas numa linha viraram sub-navegação lateral agrupada
          (arquétipo C). O `?tab=` na URL e cada TabsContent continuam iguais. */}
      <Tabs
        defaultValue={abaPadrao}
        orientation="vertical"
        className="group/tabs w-full flex-row items-start gap-8 data-vertical:flex-row"
      >
        <SubNav
          grupos={[
            {
              titulo: "Cadastro",
              itens: [
                { value: "ficha", label: "Ficha" },
                { value: "dependentes", label: "Dependentes", contagem: dependentes.length },
                { value: "dossie", label: "Dossiê", contagem: documentos.length },
              ],
            },
            {
              titulo: "Tempo",
              itens: [
                { value: "ferias", label: "Férias", alerta: !!resumoFerias?.temVencido },
                { value: "ausencias", label: "Ausências", contagem: ausencias.length },
              ],
            },
            {
              titulo: "Segurança",
              itens: [
                { value: "seguranca", label: "SST (ASO, NR)", alerta: irregular },
                { value: "epis", label: "EPIs", contagem: entregasEpi.length },
                { value: "acidentes", label: "Acidentes", contagem: acidentes.length },
              ],
            },
            {
              titulo: "Carreira",
              itens: [
                { value: "carreira", label: "Movimentações", contagem: movimentacoes.length },
                { value: "desempenho", label: "Desempenho", contagem: avaliacoes.length },
                { value: "metas-pdi", label: "Metas & PDI" },
                { value: "treinamentos", label: "Treinamentos", contagem: participacoesTreinamento.length },
                { value: "disciplinar", label: "Disciplinar", contagem: ocorrenciasDisciplinares.length },
              ],
            },
            {
              titulo: "Patrimônio",
              itens: [
                { value: "beneficios", label: "Benefícios", contagem: beneficios.length },
                { value: "entregas", label: "Entregas", contagem: entregas.length },
              ],
            },
            {
              titulo: "Ciclo",
              itens: [
                { value: "integracao", label: "Integração", oculto: !colaborador.ativo },
                { value: "desligamento", label: "Desligamento", oculto: !colaborador.dataDesligamento },
              ],
            },
          ]}
        />
        <div className="min-w-0 flex-1">

        <TabsContent value="ficha">
          <FichaBlocos
            empresaId={empresaId}
            colaborador={colaborador}
            setores={setores}
            posicoes={posicoes}
            candidatosSupervisor={candidatosSupervisor}
          />
        </TabsContent>
        <TabsContent value="dependentes">
          <DependentesCard empresaId={empresaId} colaboradorId={colaborador.id} dependentes={dependentes} />
        </TabsContent>
        <TabsContent value="dossie">
          <DocumentosCard empresaId={empresaId} colaboradorId={colaborador.id} documentos={documentos} />
        </TabsContent>
        <TabsContent value="ferias">
          <FeriasCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            solicitacoes={ferias}
            resumo={resumoFerias}
          />
        </TabsContent>
        <TabsContent value="ausencias">
          <AusenciasCard empresaId={empresaId} colaboradorId={colaborador.id} ausencias={ausencias} />
        </TabsContent>
        <TabsContent value="seguranca">
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
        <TabsContent value="carreira">
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
        <TabsContent value="beneficios">
          <BeneficiosCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            beneficios={beneficios}
            tiposBeneficioCustom={tiposBeneficioCustom}
            temDependentesNoPlano={dependentesNoPlanoSaude}
          />
        </TabsContent>
        <TabsContent value="epis">
          <EpisCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            entregas={entregasEpi}
            tiposEpiDisponiveis={tiposEpiDisponiveis}
            motivosEntregaDisponiveis={motivosEntregaDisponiveis}
          />
        </TabsContent>
        <TabsContent value="entregas">
          <EntregasCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            entregas={entregas}
            tiposEntregaDisponiveis={tiposEntregaDisponiveis}
          />
        </TabsContent>
        <TabsContent value="acidentes">
          <AcidentesCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            acidentes={acidentes}
            ausenciasElegiveis={ausenciasElegiveisAcidente}
            tiposAcidenteDisponiveis={tiposAcidenteDisponiveis}
          />
        </TabsContent>
        <TabsContent value="desempenho">
          <DesempenhoCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            avaliacoes={avaliacoes}
            competenciasDisponiveis={competenciasDisponiveis}
          />
        </TabsContent>
        <TabsContent value="metas-pdi">
          <MetasPdiCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            metas={metas}
            pdi={pdi}
            statusMetaDisponiveis={statusMetaDisponiveis}
          />
        </TabsContent>
        <TabsContent value="treinamentos">
          <TreinamentosCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            participacoes={participacoesTreinamento}
            treinamentosAtivos={treinamentosAtivos}
          />
        </TabsContent>
        <TabsContent value="disciplinar">
          <DisciplinarCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            ocorrencias={ocorrenciasDisciplinares}
          />
        </TabsContent>
        {colaborador.ativo && (
          <TabsContent value="integracao">
            <IntegracaoCard
              empresaId={empresaId}
              colaboradorId={colaborador.id}
              itens={checklistIntegracao}
            />
          </TabsContent>
        )}
        {colaborador.dataDesligamento && (
          <TabsContent value="desligamento">
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
        </div>
      </Tabs>
    </div>
  );
}

