"use client";

import { Clock, FileText, LogOut, MessageCircle, PencilLine, Star, Stethoscope, Upload, User, UsersRound } from "lucide-react";
import { BaterPontoCard } from "./bater-ponto-card";
import { SolicitacoesPontoCard } from "./solicitacoes-ponto-card";
import { ConfirmarEntregasCard, type EntregaAConfirmar } from "./confirmar-entregas-card";
import { MeuBancoHorasCard } from "./meu-banco-horas-card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeuCadastro, EnviarDocumento } from "./meu-cadastro";
import { FaleComRh, type MensagemDoPortal } from "./fale-com-rh";
import { MinhasAvaliacoes, type MinhaAvaliacao, type EquipeDoGerente } from "./minhas-avaliacoes";
import { MeuTimeDoGestor, type MeuTimePortal } from "./meu-time";
import { sairDoPortal } from "@/lib/actions/portal";
import { formatarTamanho } from "@/lib/anexos";
// Mesma máscara usada na listagem interna — o portal confirma identidade,
// não serve para descobrir o CPF de ninguém.
import { mascararCpf } from "@/lib/cpf";
import { STATUS_SOLICITACAO_BADGE, tipoAusenciaLabel, tipoContratoLabel, tipoDocumentoLabel } from "@/lib/constants-dp";
import { formatarData, tempoDeCasa } from "@/lib/datas";

type Colaborador = {
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  dataAdmissao: Date | null;
  tipoContrato: string | null;
  matricula: string | null;
  cidade: string | null;
  uf: string | null;
  emergenciaNome: string | null;
  emergenciaTelefone: string | null;
  emergenciaParentesco: string | null;
  estadoCivil: string | null;
  escolaridade: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  cep: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  complemento: string | null;
  bairro: string | null;
  rg: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  pis: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  tituloEleitor: string | null;
  setor: { nome: string };
  posicao: { nome: string };
  pontoLiberado: boolean;
};

type Documento = {
  id: string;
  tipo: string;
  descricao: string | null;
  validoAte: Date | null;
  origem: string;
  conferidoEm: Date | null;
  arquivo: { id: string; nome: string; tamanhoBytes: number } | null;
};

type Ausencia = {
  id: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  status: string;
};

export function PortalInicio({
  entregasAConfirmar,
  colaborador,
  documentos,
  ausencias,
  mensagens,
  avaliacoes,
  equipe,
  meuTime,
  bancoHoras,
}: {
  /** Entregas que o RH registrou e a pessoa ainda não confirmou. */
  entregasAConfirmar: EntregaAConfirmar[];
  colaborador: Colaborador;
  documentos: Documento[];
  ausencias: Ausencia[];
  mensagens: MensagemDoPortal[];
  avaliacoes: MinhaAvaliacao[];
  equipe: EquipeDoGerente | null;
  meuTime: MeuTimePortal | null;
  bancoHoras?: {
    competencia: string;
    saldoAnterior: number;
    creditosMes: number;
    debitosMes: number;
    saldoAtual: number;
    expiraEm: Date | null;
  } | null;
}) {
  const avaliacoesPendentes = avaliacoes.filter((a) => a.status !== "CONCLUIDA").length;
  // Gerente vê a aba mesmo sem nada na lista — é onde ele monta a lista.
  const temAvaliacao = avaliacoes.length > 0 || equipe !== null;
  // O que ainda falta na ficha. Serve de convite: um número concreto puxa mais
  // preenchimento que um formulário mudo.
  const camposFaltando = [
    colaborador.telefone, colaborador.email, colaborador.estadoCivil,
    colaborador.escolaridade, colaborador.nomeMae, colaborador.nacionalidade,
    colaborador.cep, colaborador.logradouro, colaborador.bairro,
    colaborador.emergenciaNome, colaborador.emergenciaTelefone,
    // Sem chavePix desde 13/08/2026: a chave passou a ser o CPF, que o portal
    // mostra pronto e não deixa editar. Contar um campo que não existe mais no
    // formulário deixaria o convite "faltam 3 dados" impossível de zerar.
  ].filter((v) => !v).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{colaborador.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {colaborador.setor.nome} · {colaborador.posicao.nome}
        </p>
      </div>

      {/* Vem ANTES do ponto: some assim que a pessoa confirma, então ocupar o
          topo custa pouco e é o único jeito de a confirmação acontecer no dia
          da entrega em vez de na semana seguinte. */}
      <ConfirmarEntregasCard entregas={entregasAConfirmar} />

      {/* Card de Ponto Eletrônico PWA / Mobile — só para quem o RH já
          liberou (Colaborador.pontoLiberado). Esconder aqui é conveniência de
          tela; quem trava de verdade é registrarPontoPortal, porque a action
          é endpoint público. */}
      {colaborador.pontoLiberado ? (
        <BaterPontoCard />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            Seu acesso ao ponto eletrônico ainda não foi liberado pelo RH.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3">
        <Destaque
          rotulo="Tempo de casa"
          valor={colaborador.dataAdmissao ? tempoDeCasa(colaborador.dataAdmissao) : "—"}
          complemento={colaborador.dataAdmissao ? `desde ${formatarData(colaborador.dataAdmissao)}` : ""}
        />
      </div>

      {/* Avaliação em aberto manda na aba inicial: é tarefa com prazo, vinda de
          um convite que a pessoa acabou de receber. Passado o ciclo, a tela
          volta a abrir em "Atualizar". */}
      <Tabs
        defaultValue={
          avaliacoesPendentes > 0 || (equipe !== null && avaliacoes.length === 0)
            ? "avaliacao"
            : "atualizar"
        }
      >
        <TabsList variant="line" className="w-full">
          {temAvaliacao && (
            <TabsTrigger value="avaliacao">
              <Star />
              Avaliação
              {avaliacoesPendentes > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 tabular-nums">
                  {avaliacoesPendentes}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {/* A aba do gestor: quem tem equipe (supervisorId apontando para si)
              vê o time — leitura, com a mesma conta da tela do RH. */}
          {meuTime !== null && (
            <TabsTrigger value="time">
              <UsersRound />
              Meu time
            </TabsTrigger>
          )}
          {/* "Atualizar" primeiro e como padrão: hoje o que o RH precisa de
              cada pessoa é a ficha completa, e a aba que abre é a que é usada.
              Atestados fica por último — é consulta, não tarefa pendente. */}
          <TabsTrigger value="ponto">
            <Clock />
            Ponto Eletrônico
          </TabsTrigger>
          <TabsTrigger value="atualizar">
            <PencilLine />
            Atualizar
          </TabsTrigger>
          <TabsTrigger value="enviar">
            <Upload />
            Enviar documentos
          </TabsTrigger>
          <TabsTrigger value="documentos">
            <FileText />
            Documentos
          </TabsTrigger>
          <TabsTrigger value="dados">
            <User />
            Meus dados
          </TabsTrigger>
          <TabsTrigger value="mensagens">
            <MessageCircle />
            Fale com o RH
          </TabsTrigger>
          <TabsTrigger value="atestados">
            <Stethoscope />
            Atestados
          </TabsTrigger>
        </TabsList>

        {/* Sem BaterPontoCard aqui: ele já fica no topo da tela, sempre
            visível. Até 14/08/2026 aparecia nos dois lugares, e quem abria
            esta aba via dois cartões de bater ponto na mesma tela. O de cima
            é o que fica — marcar o ponto é a ação mais frequente do portal, e
            exigir um clique em aba antes é atrito no celular. */}
        <TabsContent value="ponto" className="space-y-4 pt-4">
          {/* Pedidos de ajuste de marcação e abono em dia de folga — nada
              muda sozinho: cai na fila do RH (aba Tratamento), que aprova ou
              recusa. Aparece mesmo sem pontoLiberado: quem ainda não bate
              ponto pelo app pode justamente precisar pedir um ajuste. */}
          <SolicitacoesPontoCard />
          <MeuBancoHorasCard
            dados={{
              competencia: bancoHoras?.competencia || new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }),
              saldoAnteriorMin: bancoHoras?.saldoAnterior || 0,
              creditosMesMin: bancoHoras?.creditosMes || 0,
              debitosMesMin: bancoHoras?.debitosMes || 0,
              saldoAtualMin: bancoHoras?.saldoAtual || 0,
              historicoMensal: [],
            }}
          />
        </TabsContent>

        {temAvaliacao && (
          <TabsContent value="avaliacao" className="pt-4">
            <MinhasAvaliacoes avaliacoes={avaliacoes} equipe={equipe} />
          </TabsContent>
        )}

        {meuTime !== null && (
          <TabsContent value="time" className="pt-4">
            <MeuTimeDoGestor time={meuTime} />
          </TabsContent>
        )}

        <TabsContent value="mensagens" className="pt-4">
          <FaleComRh mensagens={mensagens} />
        </TabsContent>

        <TabsContent value="atestados" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="size-4" />
                Atestados e ausências
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ausencias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma ausência registrada.</p>
              ) : (
                ausencias.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div className="text-sm">
                      {tipoAusenciaLabel(a.tipo)}
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                        {formatarData(a.dataInicio)} — {formatarData(a.dataFim)} · {a.dias} dia(s)
                      </span>
                    </div>
                    <StatusBadge status={a.status} map={STATUS_SOLICITACAO_BADGE} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Seus documentos</CardTitle>
              <CardDescription>
                O que você enviou e o que o RH guardou no seu dossiê. Toque para abrir ou baixar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {documentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento disponível ainda.</p>
              ) : (
                documentos.map((d) => {
                  // Enviado pela pessoa e ainda sem aval do RH. Sem dizer isso na
                  // tela, quem manda um documento não sabe se chegou, se está
                  // sendo olhado, ou se precisa mandar de novo — e manda de novo.
                  const emConferencia = d.origem === "COLABORADOR" && d.conferidoEm === null;
                  return (
                    <a
                      key={d.id}
                      href={`/api/portal/arquivos/${d.arquivo!.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <FileText className="size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{tipoDocumentoLabel(d.tipo)}</span>
                          {emConferencia ? (
                            <Badge variant="secondary">Em conferência pelo RH</Badge>
                          ) : d.origem === "COLABORADOR" ? (
                            <Badge variant="default">Aceito</Badge>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.descricao ?? d.arquivo!.nome} · {formatarTamanho(d.arquivo!.tamanhoBytes)}
                          {d.validoAte && ` · vale até ${formatarData(d.validoAte)}`}
                        </span>
                        {emConferencia && (
                          <span className="block text-xs text-muted-foreground">
                            Você enviou. O RH vai conferir — não precisa mandar de novo.
                          </span>
                        )}
                      </span>
                    </a>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dados" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Meus dados</CardTitle>
              <CardDescription>
                Encontrou algo errado? Avise o RH — a correção é feita por lá.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Dado rotulo="Matrícula" valor={colaborador.matricula} />
              <Dado rotulo="CPF" valor={mascararCpf(colaborador.cpf)} />
              <Dado rotulo="Admissão" valor={formatarData(colaborador.dataAdmissao)} />
              <Dado
                rotulo="Contrato"
                valor={colaborador.tipoContrato ? tipoContratoLabel(colaborador.tipoContrato) : null}
              />
              <Dado rotulo="Setor" valor={colaborador.setor.nome} />
              <Dado rotulo="Função" valor={colaborador.posicao.nome} />
              <Dado rotulo="Telefone" valor={colaborador.telefone} />
              <Dado rotulo="E-mail" valor={colaborador.email} />
              <Dado
                rotulo="Cidade"
                valor={[colaborador.cidade, colaborador.uf].filter(Boolean).join(" / ") || null}
              />
              <Dado
                rotulo="Contato de emergência"
                valor={
                  colaborador.emergenciaNome
                    ? `${colaborador.emergenciaNome}${colaborador.emergenciaTelefone ? ` · ${colaborador.emergenciaTelefone}` : ""}`
                    : null
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contato, endereço e emergência gravam direto — nada aqui espera
            aval do RH. Anexar documento é outra tarefa, com outro tempo e outra
            expectativa, então mora na aba ao lado. */}
        <TabsContent value="atualizar" className="pt-4">
          <MeuCadastro dados={colaborador} faltando={camposFaltando} />
        </TabsContent>

        {/* O que o colaborador anexa espera conferência do RH antes de valer. */}
        <TabsContent value="enviar" className="pt-4">
          <EnviarDocumento
            enviados={documentos.map((d) => ({
              tipo: tipoDocumentoLabel(d.tipo),
              conferido: d.origem !== "COLABORADOR" || d.conferidoEm !== null,
            }))}
          />
        </TabsContent>
      </Tabs>

      <form action={sairDoPortal}>
        <Button type="submit" variant="outline" size="lg" className="w-full">
          <LogOut className="size-4" />
          Sair
        </Button>
      </form>
    </div>
  );
}

function Destaque({
  rotulo,
  valor,
  complemento,
}: {
  rotulo: string;
  valor: string;
  complemento?: string;
}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      {complemento && <div className="text-xs text-muted-foreground">{complemento}</div>}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-sm break-words">{valor || "—"}</div>
    </div>
  );
}
