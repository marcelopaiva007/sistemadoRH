"use client";

import { CalendarDays, FileText, LogOut, PencilLine, Star, Stethoscope, Upload, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeuCadastro, EnviarDocumento } from "./meu-cadastro";
import { MinhasAvaliacoes, type MinhaAvaliacao, type EquipeDoGerente } from "./minhas-avaliacoes";
import { sairDoPortal } from "@/lib/actions/portal";
import { formatarTamanho } from "@/lib/anexos";
// Mesma máscara usada na listagem interna — o portal confirma identidade,
// não serve para descobrir o CPF de ninguém.
import { mascararCpf } from "@/lib/cpf";
import { statusSolicitacaoLabel, tipoAusenciaLabel, tipoContratoLabel, tipoDocumentoLabel } from "@/lib/constants-dp";
import { formatarData, tempoDeCasa } from "@/lib/datas";
import { STATUS_PERIODO_LABEL, type ResumoFerias } from "@/lib/ferias";

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
};

type Ferias = {
  id: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  diasAbono: number;
  status: string;
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

function varianteStatus(status: string) {
  if (status === "APROVADA") return "default" as const;
  if (status === "REPROVADA" || status === "CANCELADA") return "destructive" as const;
  return "secondary" as const;
}

export function PortalInicio({
  colaborador,
  ferias,
  documentos,
  ausencias,
  resumoFerias,
  avaliacoes,
  equipe,
}: {
  colaborador: Colaborador;
  ferias: Ferias[];
  documentos: Documento[];
  ausencias: Ausencia[];
  resumoFerias: ResumoFerias | null;
  avaliacoes: MinhaAvaliacao[];
  equipe: EquipeDoGerente | null;
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
  ].filter((v) => !v).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{colaborador.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {colaborador.setor.nome} · {colaborador.posicao.nome}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Destaque
          rotulo="Saldo de férias"
          valor={resumoFerias ? `${resumoFerias.saldoDisponivel}` : "—"}
          complemento={resumoFerias ? "dias disponíveis" : "fale com o RH"}
        />
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
          {/* "Atualizar" primeiro e como padrão: hoje o que o RH precisa de
              cada pessoa é a ficha completa, e a aba que abre é a que é usada.
              Férias fica por último — é consulta, não tarefa pendente. */}
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
          <TabsTrigger value="ferias">
            <CalendarDays />
            Férias
          </TabsTrigger>
        </TabsList>

        {temAvaliacao && (
          <TabsContent value="avaliacao" className="pt-4">
            <MinhasAvaliacoes avaliacoes={avaliacoes} equipe={equipe} />
          </TabsContent>
        )}

        <TabsContent value="ferias" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Seus períodos</CardTitle>
              <CardDescription>
                A cada 12 meses de trabalho você ganha 30 dias de férias, que precisam ser tirados
                no ano seguinte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!resumoFerias && (
                <p className="text-sm text-muted-foreground">
                  Sua data de admissão ainda não está no cadastro. Procure o RH para liberar o
                  controle de férias.
                </p>
              )}
              {resumoFerias?.periodos
                .filter((p) => p.status !== "CONCLUIDO")
                .map((p) => (
                  <div
                    key={p.inicio.toISOString()}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium tabular-nums">
                        {formatarData(p.inicio)} — {formatarData(p.fim)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.status === "EM_CURSO"
                          ? "Ainda completando 12 meses"
                          : `Tirar até ${formatarData(p.limiteConcessivo)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{p.saldo} dias</span>
                      <Badge variant={p.status === "VENCIDO" ? "destructive" : "secondary"}>
                        {STATUS_PERIODO_LABEL[p.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              {resumoFerias && resumoFerias.periodos.every((p) => p.status === "CONCLUIDO") && (
                <p className="text-sm text-muted-foreground">
                  Você não tem saldo de férias em aberto no momento.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Programadas</CardTitle>
              <CardDescription>
                Para pedir ou alterar férias, fale com seu gestor ou com o RH.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ferias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma férias programada.</p>
              ) : (
                ferias.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div className="text-sm tabular-nums">
                      {formatarData(f.dataInicio)} — {formatarData(f.dataFim)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {f.dias} dia(s)
                        {f.diasAbono > 0 && ` + ${f.diasAbono} vendidos`}
                      </span>
                    </div>
                    <Badge variant={varianteStatus(f.status)}>{statusSolicitacaoLabel(f.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

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
                    <Badge variant={varianteStatus(a.status)}>{statusSolicitacaoLabel(a.status)}</Badge>
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
