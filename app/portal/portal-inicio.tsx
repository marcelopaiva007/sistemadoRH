"use client";

import { useState } from "react";
import { ClipboardCheck, Clock, FileText, Home, LogOut, MessageCircle, Stethoscope, User, UsersRound } from "lucide-react";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { Indicador } from "@/components/indicador";
import { BaterPontoCard } from "./bater-ponto-card";
import { SolicitacoesPontoCard } from "./solicitacoes-ponto-card";
import { ConfirmarEntregasCard, type EntregaAConfirmar } from "./confirmar-entregas-card";
import { MinhasDemandasCard } from "./minhas-demandas-card";
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

  // Uma aba só é a inicial: as tarefas com prazo (avaliação, entregas,
  // cadastro) aparecem em "Para você fazer" logo abaixo do ponto, e cada
  // uma leva para a tela certa — em vez de a aba inicial trocar sozinha
  // conforme o que está pendente, o que desorientava.
  const [aba, setAba] = useState("inicio");
  const paraFazer: { chave: string; titulo: string; detalhe: string; contagem?: number; aba: string }[] = [];
  if (avaliacoesPendentes > 0) {
    paraFazer.push({
      chave: "avaliacao",
      titulo: avaliacoesPendentes === 1 ? "Responder a avaliação" : "Responder as avaliações",
      detalhe: "Tem prazo — o RH acompanha quem já concluiu.",
      contagem: avaliacoesPendentes,
      aba: "avaliacao",
    });
  }
  // Avaliar a equipe é tarefa PRÓPRIA do gestor, não alternativa à avaliação
  // dele. Até a v1.165.0 isto era `else if (… && avaliacoes.length === 0)`: o
  // gestor que já tinha respondido a sua caía fora das duas condições e ficava
  // sem NENHUMA porta para a aba — que não está na barra de cinco.
  if (equipe !== null) {
    paraFazer.push({ chave: "equipe", titulo: "Avaliar a sua equipe", detalhe: "O ciclo está aberto.", aba: "avaliacao" });
  }
  if (camposFaltando > 0) {
    paraFazer.push({
      chave: "cadastro",
      titulo: "Completar o cadastro",
      detalhe: `${camposFaltando} ${camposFaltando === 1 ? "campo falta" : "campos faltam"} — o RH cobra por Telegram.`,
      contagem: camposFaltando,
      aba: "dados",
    });
  }
  const docsEmConferencia = documentos.filter((d) => d.origem === "COLABORADOR" && d.conferidoEm === null).length;

  return (
    // `pb-24`: o conteúdo termina antes da barra fixa de 64px lá embaixo.
    <Tabs value={aba} onValueChange={(v) => setAba(String(v))} className="gap-0 pb-24">
      {/* ---------------- Início ---------------- */}
      <TabsContent value="inicio" className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate">{colaborador.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {colaborador.setor.nome} · {colaborador.posicao.nome}
            </p>
          </div>
          <form action={sairDoPortal}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut />
              Sair
            </Button>
          </form>
        </div>

        {/* Confirmar entrega é a tarefa que mais vale no dia em que acontece;
            demandas com prazo aparecem só quando existem. */}
        <ConfirmarEntregasCard entregas={entregasAConfirmar} />
        <MinhasDemandasCard />

        {/* Marcar o ponto é a ação mais frequente do portal: fica na inicial,
            sem aba no caminho. Esconder aqui é conveniência de tela; quem
            trava de verdade é registrarPontoPortal (endpoint público). */}
        {colaborador.pontoLiberado ? (
          <BaterPontoCard />
        ) : (
          <div className="flex items-center gap-2 border-2 border-border p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            Seu acesso ao ponto eletrônico ainda não foi liberado pelo RH.
          </div>
        )}

        {paraFazer.length > 0 && (
          <div>
            <p className="border-b-2 border-border pb-1.5 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
              Para você fazer
            </p>
            <ul>
              {paraFazer.map((item) => (
                <li key={item.chave} className="border-b border-border">
                  <button
                    type="button"
                    onClick={() => setAba(item.aba)}
                    className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-foreground/4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{item.titulo}</span>
                      <span className="block text-[13px] text-muted-foreground">{item.detalhe}</span>
                    </span>
                    {item.contagem != null && (
                      <span className="shrink-0 bg-accent px-2 py-0.5 text-[12px] font-semibold tabular-nums text-accent-foreground">
                        {item.contagem}
                      </span>
                    )}
                    <span aria-hidden className="text-muted-foreground">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FaixaDeIndicadores colunas={2}>
          {/* Banco de horas ainda não é apurado por ninguém: a tabela BancoHoras
              nunca recebeu escrita (não existe create/update/upsert em app/ nem
              em lib/). O aviso fica NO LUGAR do valor — o "—" que estava aqui
              se lê como "ainda sem movimento neste mês", que é outra coisa. */}
          <Indicador rotulo="Banco de horas" valor="—" complemento="em implantação — o sistema ainda não apura" />
          <Indicador
            rotulo="Tempo de casa"
            valor={colaborador.dataAdmissao ? tempoDeCasa(colaborador.dataAdmissao) : "—"}
            complemento={colaborador.dataAdmissao ? `desde ${formatarData(colaborador.dataAdmissao)}` : undefined}
          />
        </FaixaDeIndicadores>

        {/* Avaliação já respondida não é tarefa e não entra em "Para você
            fazer" — mas continua sendo consultável. Sem este botão a aba
            existia sem porta para quem não tinha nada pendente. */}
        {temAvaliacao && !paraFazer.some((i) => i.aba === "avaliacao") && (
          <Button variant="outline" size="lg" className="w-full" onClick={() => setAba("avaliacao")}>
            <ClipboardCheck />
            Ver a minha avaliação
            <span data-icon="inline-end" aria-hidden>›</span>
          </Button>
        )}

        {meuTime !== null && (
          <Button variant="outline" size="lg" className="w-full" onClick={() => setAba("time")}>
            <UsersRound />
            Ver a minha equipe
            <span data-icon="inline-end" aria-hidden>›</span>
          </Button>
        )}
      </TabsContent>

      {/* ---------------- Ponto ---------------- */}
      <TabsContent value="ponto" className="space-y-4">
        <h1>Ponto</h1>
        {colaborador.pontoLiberado && <BaterPontoCard />}
          {/* Pedidos de ajuste de marcação e abono em dia de folga — nada
              muda sozinho: cai na fila do RH (aba Tratamento), que aprova ou
              recusa. Aparece mesmo sem pontoLiberado: quem ainda não bate
              ponto pelo app pode justamente precisar pedir um ajuste. */}
          <SolicitacoesPontoCard />
      </TabsContent>

      {/* Avaliação e equipe não têm lugar na barra de cinco: chegam pelo
          "Para você fazer" da inicial, e têm o caminho de volta no topo. */}
      {temAvaliacao && (
        <TabsContent value="avaliacao" className="space-y-4">
          <Voltar aoVoltar={() => setAba("inicio")} />
            <MinhasAvaliacoes avaliacoes={avaliacoes} equipe={equipe} />
          
        </TabsContent>
      )}
      {meuTime !== null && (
        <TabsContent value="time" className="space-y-4">
          <Voltar aoVoltar={() => setAba("inicio")} />
            <MeuTimeDoGestor time={meuTime} />
          
        </TabsContent>
      )}

      {/* ---------------- Documentos: o que existe, enviar, atestados ---------------- */}
      <TabsContent value="documentos" className="space-y-6">
        <h1>Documentos</h1>
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
        
          <EnviarDocumento
            enviados={documentos.map((d) => ({
              tipo: tipoDocumentoLabel(d.tipo),
              conferido: d.origem !== "COLABORADOR" || d.conferidoEm !== null,
            }))}
          />
        
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

      {/* ---------------- Fale com o RH ---------------- */}
      <TabsContent value="rh" className="space-y-4">
        <h1>Fale com o RH</h1>
          <FaleComRh mensagens={mensagens} />
        
      </TabsContent>

      {/* ---------------- Meus dados: atualizar + conferir ---------------- */}
      <TabsContent value="dados" className="space-y-6">
        <h1>Meus dados</h1>
          <MeuCadastro dados={colaborador} faltando={camposFaltando} />
        
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

      {/* A barra de baixo: cinco destinos, 64px, toque ≥ 44px. Ícone de 20px
          com rótulo de 10,5px; o ativo em --primary. */}
      <TabsList
        aria-label="Seções do portal"
        className="fixed inset-x-0 bottom-0 z-40 grid h-16 w-full grid-cols-5 border-t-2 border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        {(
          [
            { valor: "inicio", label: "Início", Icone: Home },
            { valor: "ponto", label: "Ponto", Icone: Clock },
            { valor: "documentos", label: "Documentos", Icone: FileText, marca: docsEmConferencia },
            { valor: "rh", label: "Fale com RH", Icone: MessageCircle },
            { valor: "dados", label: "Meus dados", Icone: User, marca: camposFaltando },
          ] as const
        ).map(({ valor, label, Icone, ...resto }) => (
          <TabsTrigger
            key={valor}
            value={valor}
            className="relative mb-0 h-full flex-col gap-1 border-b-0 px-1 text-[10.5px] font-semibold text-muted-foreground data-active:border-transparent data-active:text-primary"
          >
            <Icone className="size-5" />
            {label}
            {"marca" in resto && resto.marca > 0 && (
              <span aria-hidden className="absolute top-2 right-[calc(50%-18px)] size-2 bg-primary" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Voltar({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoVoltar}
      className="flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
    >
      ‹ Início
    </button>
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
