"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  AlertOctagon,
  UsersRound,
  FileCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Download,
  HardHat,
  Rocket,
  ShieldCheck,
  Plane,
  DoorOpen,
  ClipboardList,
  Star,
  MessagesSquare,
  History,
  FileSignature,
  Send,
  Timer,
  Users,
  Stethoscope,
  CircleDashed,
  AlertCircle,
  Clock,
  MessageCircle,
  Package,
  Gavel,
  Target,
  FileX,
  UserMinus,
  Radar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { Indicador } from "@/components/indicador";
import { PENDENCIAS_CADASTRO, PENDENCIAS_DECIDIR, PENDENCIAS_PRAZO } from "@/lib/pendencias-natureza";
// O tipo vem da lib, não de uma cópia local: a cópia divergiu quando as seis
// situações novas entraram e o build caiu por isso.
import type { CicloAEncerrar, Pendencias, PesquisaAberta } from "@/lib/pendencias";
import { cn } from "@/lib/utils";

export function PendenciasView({
  empresaId,
  escopo,
  pendencias,
  semRegistro,
  diasAlerta,
  pesquisasAbertas,
  ciclosAEncerrar,
}: {
  empresaId: string;
  /** CNPJs que os números desta tela somam (a marca, ou o filtro da URL). */
  escopo: string[];
  pendencias: Pendencias;
  // Módulos sem NENHUM registro nesta marca. Chega como array, não Set: o que
  // atravessa de Server para Client Component tem que ser serializável.
  semRegistro: (keyof Pendencias)[];
  diasAlerta: number;
  // Detalhe do cartão "Pesquisa a encerrar": qual pesquisa e há quantos dias
  // está aberta. O número sozinho não ajuda a decidir quando encerrar.
  pesquisasAbertas: PesquisaAberta[];
  // Detalhe do cartão "Ciclo de avaliação a encerrar": qual ciclo, atraso e
  // quantas avaliações faltam — o que era o contador até 10/08/2026 (235
  // avaliações inflando o total) vira contexto do cartão.
  ciclosAEncerrar: CicloAEncerrar[];
}) {
  const [exportando, setExportando] = useState(false);

  // O recorte desta tela viaja junto no clique: quem estreitou para um CNPJ e
  // clica em "14 Férias vencidas" precisa cair na tela de Férias DAQUELE CNPJ,
  // e quem está na visão da marca precisa cair na tela DA MARCA. Sem filtro na
  // URL o link leva o `escopo` (os CNPJs da marca) explícito — os números
  // desta tela somam por marca, mas as telas de destino sem `?empresas=`
  // abrem no grupo inteiro que o usuário enxerga, e o número do cartão não
  // bateria com a lista. `extra` acrescenta o filtro da situação (ex.:
  // filtro=RISCO_DOBRA) para a tela já abrir listando a pendência clicada.
  const searchParams = useSearchParams();
  const empresasParam = searchParams.get("empresas") ?? escopo.join(",");
  const comFiltro = (path: string, extra?: string) => {
    const params = new URLSearchParams();
    if (empresasParam) params.set("empresas", empresasParam);
    for (const par of extra?.split("&") ?? []) {
      const [chave, valor] = par.split("=");
      if (chave && valor) params.set(chave, valor);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  // "há 34 dias · 12 respostas" para cada pesquisa aberta, as três mais antigas
  // primeiro. O tempo aberto é o que orienta a decisão de encerrar; a contagem
  // de respostas diz se ainda vale esperar mais.
  const dias = (n: number) => (n === 0 ? "aberta hoje" : `há ${n} ${n === 1 ? "dia" : "dias"}`);
  const descricaoPesquisas =
    pesquisasAbertas.length === 0
      ? "Aberta para os colaboradores; o resultado só fecha quando o RH encerra."
      : pesquisasAbertas
          .slice(0, 3)
          .map((p) => `${p.titulo} — ${dias(p.diasAberta)}, ${p.respostas} resp.`)
          .join(" · ") +
        (pesquisasAbertas.length > 3 ? ` · +${pesquisasAbertas.length - 3}` : "");

  // "Ciclo X — venceu há 12 dias, 235 av. pendentes": o atraso diz a urgência
  // de encerrar; as avaliações que faltam dizem o tamanho da cobrança.
  const atras = (n: number) => (n === 0 ? "hoje" : `há ${n} ${n === 1 ? "dia" : "dias"}`);
  const descricaoCiclos =
    ciclosAEncerrar.length === 0
      ? "Janela encerrada com o ciclo ainda aberto — cobrar avaliações e encerrar."
      : ciclosAEncerrar
          .slice(0, 3)
          .map((c) => `${c.nome} — venceu ${atras(c.diasVencido)}, ${c.avaliacoesPendentes} av. pendentes`)
          .join(" · ") + (ciclosAEncerrar.length > 3 ? ` · +${ciclosAEncerrar.length - 3}` : "");

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.getElementById("pendencias-content");
      if (!element) return;
      html2pdf()
        .set({ filename: `pendencias-${new Date().toISOString().split("T")[0]}.pdf` })
        .from(element)
        .save();
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
    } finally {
      setExportando(false);
    }
  };

  const cartoes: {
    chave: keyof Pendencias;
    titulo: string;
    descricao: string;
    href: string;
    icon: LucideIcon;
    // Urgente = tem prazo legal ou já estourou. Muda a cor, não a ordem.
    urgente?: boolean;
  }[] = [
    {
      chave: "catPendente",
      titulo: "CAT sem emitir",
      descricao: "Prazo legal de 1 dia útil ao INSS — imediato se for fatal.",
      href: comFiltro(`/rh/${empresaId}/acidentes`),
      icon: AlertOctagon,
      urgente: true,
    },
    {
      chave: "aprovacoes",
      titulo: "Aguardando aprovação",
      descricao: "Férias e ausências esperando decisão do RH.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: CheckSquare,
    },
    {
      chave: "documentosAConferir",
      titulo: "Documentos a conferir",
      descricao: "Cópias enviadas pelo colaborador no portal, esperando validação.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: FileCheck,
    },
    {
      chave: "asoVencendo",
      titulo: "ASO vencendo",
      descricao: `Exames ocupacionais no limite dos ${diasAlerta} dias.`,
      href: comFiltro(`/rh/${empresaId}/conformidade`),
      icon: ShieldCheck,
    },
    {
      chave: "certificadosVencendo",
      titulo: "NR vencendo",
      descricao: `Certificados de norma no limite dos ${diasAlerta} dias.`,
      href: comFiltro(`/rh/${empresaId}/conformidade`),
      icon: CalendarDays,
    },
    {
      chave: "epiVencido",
      titulo: "EPI vencido",
      descricao: "Equipamento de proteção fora da validade, com a pessoa em campo.",
      href: comFiltro(`/rh/${empresaId}/vencimentos`),
      icon: HardHat,
      urgente: true,
    },
    {
      chave: "integracoesAtrasadas",
      titulo: "Integração atrasada",
      descricao: "Item da trilha de quem entrou passou do prazo.",
      href: comFiltro(`/rh/${empresaId}/integracoes`),
      icon: Rocket,
    },
    {
      chave: "feriasVencidas",
      titulo: "Férias vencidas",
      descricao: "12+ meses de casa sem férias aprovadas no último ano — risco de dobra.",
      // filtro=RISCO_DOBRA e não VENCIDO: "Vencidas" na tela de Férias são só
      // as confirmadas com histórico, e o número deste cartão não batia com a
      // lista. RISCO_DOBRA usa a mesma conta deste contador — bate pessoa a
      // pessoa.
      href: comFiltro(`/rh/${empresaId}/ferias`, "filtro=RISCO_DOBRA"),
      icon: Plane,
      urgente: true,
    },
    {
      chave: "avisoPrevio",
      titulo: "Aviso prévio em curso",
      descricao: "Saída registrada para os próximos 7 dias; o offboarding precisa andar.",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: DoorOpen,
      urgente: true,
    },
    {
      chave: "desligamentosIncompletos",
      titulo: "Desligamento incompleto",
      descricao:
        "Pessoa já saiu com item de offboarding em aberto (crachá, acesso, EPI…). Saídas a partir de 16/08/2026 — antes disso é histórico importado, sem cobrança.",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: ClipboardList,
    },
    {
      chave: "ciclosAvaliacaoAEncerrar",
      titulo: "Ciclo de avaliação a encerrar",
      descricao: descricaoCiclos,
      href: comFiltro(`/rh/${empresaId}/avaliacoes`),
      icon: Star,
    },
    {
      chave: "pesquisasAbertas",
      titulo: "Pesquisa a encerrar",
      descricao: descricaoPesquisas,
      href: comFiltro(`/rh/${empresaId}/pesquisas`),
      icon: MessagesSquare,
    },
    {
      chave: "fichasDesatualizadas",
      titulo: "Ficha sem atualização",
      descricao: "Cadastro sem nenhuma gravação há mais de 6 meses.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: History,
    },
    {
      chave: "contratosVencendo",
      titulo: "Contrato vencendo",
      descricao: `Experiência, temporário ou estágio terminando em ${diasAlerta} dias — passar do prazo torna o contrato indeterminado.`,
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: FileSignature,
      urgente: true,
    },
    {
      chave: "horasExtrasExcedidas",
      titulo: "Hora extra acima do limite",
      descricao: "Passou de 44h no mês aberto — o limite da CLT é 2h por dia.",
      href: comFiltro(`/rh/${empresaId}/folha`),
      icon: Timer,
      urgente: true,
    },
    {
      chave: "atestadosSemDocumento",
      titulo: "Atestado sem documento",
      descricao: "Falta já abonada sem o atestado anexado — nada sustenta o abono numa fiscalização.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: Stethoscope,
    },
    {
      chave: "dependentesSemCpf",
      titulo: "Dependente sem CPF",
      descricao: "Declarado para IRRF sem CPF; a Receita exige em qualquer idade.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: Users,
    },
    {
      chave: "semSetor",
      titulo: "Ativo sem setor definido",
      // Pedido do CEO em 27/08/2026: sem setor a pessoa fica invisível no
      // Painel do setor, no placar e no turnover por setor — e a lacuna da
      // home não chegava ao e-mail diário. Mesma condição e mesmo destino da
      // lacuna (?lacuna=setor).
      descricao:
        "Está no setor \"Não definido\" — fora do Painel do setor e das contas por setor. Abra a ficha e aponte o setor real.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`, "lacuna=setor"),
      icon: UsersRound,
    },
    {
      chave: "semTelegram",
      titulo: "Sem Telegram vinculado",
      descricao:
        "Não recebem convite de pesquisa, lembrete nem acesso ao portal. A pessoa envia /start ao bot e compartilha o número.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`, "lacuna=telegram"),
      icon: Send,
    },
    {
      chave: "cadastrosIncompletos",
      titulo: "Cadastros incompletos",
      // O texto dizia "ou sem dados bancários" até 19/08/2026, mas a regra
      // (CADASTRO_INCOMPLETO_WHERE) deixou de olhar banco em 13/08/2026, quando
      // a chave de pagamento virou o CPF (PIX-CPF) e os campos bancários saíram
      // da ficha. Quem lesse o cartão abriria a ficha atrás de um campo que não
      // existe mais — exatamente o que o comentário daquela regra queria evitar.
      descricao:
        "Sem CPF, sem nenhum contato ou sem data de admissão — o que trava pagamento e eSocial.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`, "lacuna=incompleto"),
      icon: AlertCircle,
    },
    // ---------------------------------------------------------------
    // 19/08/2026 — as oito situações que já eram fila em alguma tela do
    // sistema e não chegavam aqui. Nenhum cartão acima mudou.
    // ---------------------------------------------------------------
    {
      chave: "ajustesPontoPendentes",
      titulo: "Ajuste/abono de ponto a decidir",
      descricao:
        "Inclusão manual, abonos (atestado ou dia de folga), justificativa ou correção de marcação — inclui os pedidos feitos pelo próprio colaborador no portal/app, esperando aprovar ou rejeitar.",
      // A mesma tela onde o RH decide férias e documentos — ela busca esta fila
      // desde 11/08/2026. Preferida à aba Tratamento do módulo Ponto porque só
      // ela respeita o `?empresas=` que este cartão carrega no clique.
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: Clock,
    },
    {
      chave: "mensagensSemResposta",
      titulo: "Mensagem sem resposta",
      descricao: "Colaborador escreveu pelo Fale com o RH no portal e ainda não teve retorno.",
      href: comFiltro(`/rh/${empresaId}/mensagens`),
      icon: MessageCircle,
    },
    {
      chave: "entregasNaoConfirmadas",
      titulo: "Entrega sem confirmação",
      descricao:
        "Notebook, cartão, uniforme ou EPI entregues sem a pessoa confirmar o recebimento — sem isso não há prova da entrega.",
      href: comFiltro(`/rh/${empresaId}/entregas`),
      icon: Package,
    },
    {
      chave: "disciplinarSemAssinatura",
      titulo: "Disciplinar sem assinatura",
      descricao:
        "Advertência ou suspensão emitida e ainda sem assinatura colhida — o documento não sustenta a penalidade.",
      // A ocorrência mora no card Disciplinar dentro da ficha; não há tela de
      // lista própria. `?lacuna=disciplinar` isola na lista de colaboradores
      // exatamente quem tem assinatura pendente — sem o filtro, o cartão dizia
      // "3" e abria a base inteira, sem apontar quem eram os 3.
      href: comFiltro(`/rh/${empresaId}/colaboradores`, "lacuna=disciplinar"),
      icon: Gavel,
    },
    {
      chave: "planosAcaoVencidos",
      titulo: "Plano de ação vencido",
      descricao: "Passou do prazo sem ser concluído nem cancelado com motivo.",
      href: comFiltro(`/rh/${empresaId}/planos-acao`),
      icon: Target,
      // Prazo que JÁ estourou — mesma régua de "Férias vencidas" e "EPI
      // vencido". E o alerta AL09 já manda e-mail para a diretoria por isto.
      urgente: true,
    },
    {
      chave: "desligamentosSemChecklist",
      titulo: "Desligado sem checklist",
      descricao:
        "Saída registrada e nenhum item de offboarding criado — nada a devolver, nada a cobrar, nada rastreado. Saídas a partir de 16/08/2026, o início do uso do sistema.",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: FileX,
    },
    {
      chave: "desligamentosSemEntrevista",
      titulo: "Desligado sem entrevista",
      descricao:
        "Saída sem entrevista de desligamento registrada — o motivo real não foi apurado. Saídas a partir de 16/08/2026, o início do uso do sistema.",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: UserMinus,
    },
    {
      chave: "sinaisAbertos",
      titulo: "Sinal sem triagem",
      descricao:
        "Sinal crítico ou alto detectado na Central e ainda sem reconhecer, descartar ou virar plano.",
      href: comFiltro(`/rh/${empresaId}/sinais`),
      icon: Radar,
    },
  ];

  const vazio = new Set(semRegistro);
  const comPendencia = cartoes.filter((c) => pendencias[c.chave] > 0);
  // Zero com registro é "está em dia"; zero sem registro nenhum é "ninguém
  // usou este módulo". Separar os dois é o ponto: até 04/08/2026 os dois caíam
  // no mesmo "Tudo em dia" verde, e seis áreas nunca abertas — entre elas CAT,
  // que tem prazo legal de 1 dia útil — apareciam como conformidade.
  const semBase = cartoes.filter((c) => pendencias[c.chave] === 0 && vazio.has(c.chave));
  const emDia = cartoes.filter((c) => pendencias[c.chave] === 0 && !vazio.has(c.chave));
  const total = Object.values(pendencias).reduce((s, n) => s + n, 0);

  // As três colunas são a NATUREZA DA AÇÃO, e a classificação vem de
  // lib/pendencias.ts (PENDENCIAS_DECIDIR / PRAZO / CADASTRO) — a mesma que
  // alimenta a saudação da home e o e-mail diário, com prova de cobertura no
  // tipo e teste no CI. Não é uma segunda lista mantida aqui: duas
  // classificações da mesma coisa divergem no primeiro cartão novo.
  const COLUNAS = [
    {
      chave: "prazo" as const,
      titulo: "Prazo legal ou vencido",
      vazia: "Nenhuma data correndo contra.",
      chaves: PENDENCIAS_PRAZO as readonly (keyof Pendencias)[],
    },
    {
      chave: "decisao" as const,
      titulo: "Esperando decisão",
      vazia: "Ninguém esperando resposta do RH.",
      chaves: PENDENCIAS_DECIDIR as readonly (keyof Pendencias)[],
    },
    {
      chave: "cadastro" as const,
      titulo: "Cadastro e dados",
      vazia: "Base completa.",
      chaves: PENDENCIAS_CADASTRO as readonly (keyof Pendencias)[],
    },
  ];
  const somar = (chaves: readonly (keyof Pendencias)[]) =>
    chaves.reduce((soma, chave) => soma + pendencias[chave], 0);
  const itensDa = (chaves: readonly (keyof Pendencias)[]) =>
    comPendencia.filter((c) => chaves.includes(c.chave));

  return (
    // id-alvo do link "Pendências" na tela do grupo e dos cards de marca — sem
    // ele, o clique leva para o topo da página e a pessoa ainda precisa rolar
    // até achar a seção.
    <div id="pendencias" className="scroll-mt-4 space-y-6">
      <CabecalhoDePagina
        titulo="Pendências"
        resumo={
          total === 0
            ? `Nenhum item aberto — ${emDia.length} de ${cartoes.length} situações puderam ser avaliadas.`
            : `${total} ${total === 1 ? "item precisa" : "itens precisam"} de atenção.`
        }
        acoes={
          comPendencia.length > 0 && (
            <Button variant="outline" onClick={exportarPDF} disabled={exportando}>
              <Download />
              {exportando ? "Exportando..." : "Exportar PDF"}
            </Button>
          )
        }
      />

      <div id="pendencias-content" className="space-y-6">
        {/* Os quatro números que resumem a fila. "Em dia" é o único verde do
            sistema (--success); "prazo" é o único vermelho — o resto é tinta,
            porque destacar tudo é não destacar nada. */}
        <FaixaDeIndicadores>
          <Indicador
            rotulo="Prazo legal ou vencido"
            valor={somar(PENDENCIAS_PRAZO as readonly (keyof Pendencias)[])}
            estado={somar(PENDENCIAS_PRAZO as readonly (keyof Pendencias)[]) > 0 ? "alerta" : "padrao"}
            complemento="Data correndo contra"
          />
          <Indicador
            rotulo="Esperando decisão"
            valor={somar(PENDENCIAS_DECIDIR as readonly (keyof Pendencias)[])}
            complemento="Alguém aguarda o RH"
          />
          <Indicador
            rotulo="Cadastro e dados"
            valor={somar(PENDENCIAS_CADASTRO as readonly (keyof Pendencias)[])}
            complemento="Não trava nada hoje"
          />
          <Indicador
            rotulo="Em dia"
            valor={emDia.length}
            complemento={`de ${cartoes.length} situações`}
          />
        </FaixaDeIndicadores>

        {comPendencia.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="font-extrabold">
              {emDia.length > 0 ? "Nada esperando ação" : "Nada a mostrar ainda"}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {emDia.length > 0
                ? `${emDia.length} ${emDia.length === 1 ? "situação está" : "situações estão"} em dia.`
                : "Nenhum dos módulos acompanhados tem registro."}{" "}
              {semBase.length > 0 &&
                `Outras ${semBase.length} não puderam ser avaliadas — veja abaixo.`}
            </p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-3">
            {COLUNAS.map((coluna) => {
              const itens = itensDa(coluna.chaves);
              const ehPrazo = coluna.chave === "prazo";
              return (
                <div key={coluna.chave} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 border-b-2 border-border pb-1.5">
                    <h2 className="text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
                      {coluna.titulo}
                    </h2>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  {itens.length === 0 ? (
                    <p className="py-3 text-[12.5px] text-muted-foreground">{coluna.vazia}</p>
                  ) : (
                    <ul>
                      {itens.map((c) => (
                        <li key={c.chave} className="border-b border-border">
                          <Link
                            href={c.href}
                            className="grid grid-cols-[44px_1fr_14px] items-baseline gap-2 py-2.5 transition-colors hover:bg-foreground/4"
                          >
                            <span
                              className={cn(
                                "font-heading text-[22px] leading-none font-extrabold tabular-nums",
                                ehPrazo && "text-primary",
                              )}
                            >
                              {pendencias[c.chave]}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold">{c.titulo}</span>
                              {/* Uma linha, com a frase inteira no `title`: a
                                  descrição de "Ciclo de avaliação a encerrar"
                                  chega a três linhas e empurrava os itens
                                  seguintes para fora da tela. */}
                              <span
                                title={c.descricao}
                                className="block truncate text-[12px] text-muted-foreground"
                              >
                                {c.descricao}
                              </span>
                            </span>
                            <span aria-hidden className="text-muted-foreground">
                              ›
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé, não cartão tracejado: é uma ressalva sobre os números acima
            ("o zero não quer dizer que está tudo certo"), não uma quinta caixa
            competindo com eles. */}
        {semBase.length > 0 && (
          <p className="border-t border-border pt-3 text-[12.5px] text-muted-foreground">
            <CircleDashed aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
            <b className="font-semibold text-foreground">
              {semBase.length} {semBase.length === 1 ? "situação" : "situações"} sem base para
              avaliar
            </b>{" "}
            — estes módulos não têm nenhum registro, então o zero acima não quer dizer que esteja
            tudo certo: quer dizer que não há o que conferir.{" "}
            {semBase.map((c, i) => (
              <span key={c.chave}>
                {i > 0 && " · "}
                <Link href={c.href} className="underline underline-offset-2 hover:text-foreground">
                  {c.titulo}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
