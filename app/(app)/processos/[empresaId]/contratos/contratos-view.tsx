"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { formatarReais } from "@/lib/constants-beneficios";
import { registrarReajusteAplicado, salvarContraparte, salvarContrato } from "@/lib/actions/processos-contratos";
import {
  CATEGORIAS_CONTRATO,
  INDICES_REAJUSTE,
  PAPEIS_CONTRAPARTE,
  STATUS_CONTRATO,
  TIPOS_CONTRATO,
  TIPOS_CONTRATO_DESPESA,
  TIPOS_PESSOA,
  papelSugeridoPorTipo,
  rotulo,
} from "@/lib/processos/contratos";

export type ContratoNaTela = {
  id: string;
  empresaId: string;
  empresaNome: string;
  numero: string;
  titulo: string;
  objeto: string | null;
  tipo: string;
  categoria: string;
  status: string;
  /** VIGENTE, EM_RENOVACAO ou SUSPENSO — quem ainda tem relógio correndo. */
  prazoCorrendo: boolean;
  criticidade: string;
  gestorId: string | null;
  gestorNome: string | null;
  contraparteId: string;
  contraparteNome: string;
  dataAssinaturaInput: string;
  dataInicioInput: string;
  dataFimInput: string;
  dataFimTexto: string;
  diasParaFim: number | null;
  indeterminado: boolean;
  renovacaoAutomatica: boolean;
  avisoPrevioNaoRenovacaoDias: number | null;
  dataLimiteDenunciaTexto: string;
  diasParaDenuncia: number | null;
  janelaRenovatoriaFimTexto: string;
  locacaoNaoResidencial: boolean;
  buildToSuit: boolean;
  renunciaRevisionalPactuada: boolean;
  valorMensal: number | null;
  valorTotal: number | null;
  indiceReajuste: string | null;
  periodicidadeReajusteMeses: number | null;
  mesBaseReajuste: number | null;
  proximoReajusteTexto: string;
  /** O mês-base já chegou (ou passou) e o reajuste ainda não foi aplicado. */
  reajusteDevido: boolean;
  proximoReajusteInput: string;
  valorMensalInput: string;
  multaCompensatoriaPct: number | null;
  multaMoratoriaPct: number | null;
  foroComarca: string | null;
  foroUf: string | null;
  lgpdAplicavel: boolean;
  pontosFixacaoContratados: number | null;
  pontosFixacaoOcupados: number | null;
  observacoes: string | null;
};

/** O valor do <option> que ABRE o cadastro rápido em vez de escolher alguém. */
const NOVA_CONTRAPARTE = "__nova__";

// D7/D8 (21/09/2026). Duas correções numa linha só:
//
// `border-border` → `border-input`. O globals.css escreve a regra ao lado dos
// tokens: --border é tinta a 40%, "divisória e régua de 2px, decorativas, sem
// exigência"; --input é tinta a 55% porque "a borda do campo é a única pista
// de onde o formulário começa e precisa dos 3:1". Medido, o 40% dava 2,41:1
// sobre o fundo e 2,37:1 sobre o cartão — abaixo do mínimo da WCAG 1.4.11
// para limite de componente de interface. O 55% entrega 3,66 e 3,38.
//
// `rounded-md` saiu: --radius é 0rem desde o Modernist, então todo `rounded-*`
// derivado já valia zero. Não desenhava nada e declarava uma intenção que o
// sistema abandonou — quem copiasse a linha levaria junto.
//
// O `bg-background` FICA. Dentro do <Card> (--card, mais escuro) ele deixa o
// campo mais claro que a superfície, o que soma separação em vez de tirar;
// trocar por `bg-card`, como faz o Input do sistema, apagaria essa diferença
// justamente aqui, onde o formulário inteiro mora dentro de um cartão.
const CAMPO = "w-full border border-input bg-background px-2.5 py-1.5 text-sm";
const SECAO = "sm:col-span-2 lg:col-span-4 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function textoOuTraco(v: string | null) {
  return v && v.length > 0 ? v : "";
}

/**
 * Quantos dias faltam — em TEXTO, ao lado da data que já está na célula.
 *
 * Existe porque a urgência estava dita só por cor, e para o lado errado. Duas
 * regras do sistema se cruzam aqui:
 *
 * 1. Cor sozinha não comunica estado (WCAG 1.4.1) — a mesma razão pela qual o
 *    `Indicador` põe triângulo e texto de leitor de tela fora do estado
 *    "padrão", em vez de só pintar o número.
 * 2. O que exige decisão tem que pesar MAIS na página, não menos.
 *
 * Componente de NÍVEL SUPERIOR, e não uma função dentro do `ContratosView`:
 * definido dentro, o React o trataria como componente novo a cada render e
 * remontaria a célula. É a mesma lição escrita em `pendencias-view.tsx`.
 */
function PrazoRestante({ dias, limite }: { dias: number | null; limite: number }) {
  if (dias === null) return null;
  if (dias > limite) return null;
  const vencido = dias < 0;
  const falta = Math.abs(dias);
  return (
    <span
      className={cn(
        "mt-0.5 flex items-center gap-1 text-[11px]",
        vencido ? "font-semibold text-destructive" : "font-medium",
      )}
    >
      <TriangleAlert aria-hidden className="size-3" />
      {vencido
        ? `vencido há ${falta} ${falta === 1 ? "dia" : "dias"}`
        : dias === 0
          ? "vence hoje"
          : `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`}
    </span>
  );
}

export function ContratosView({
  empresaId,
  contratos,
  contrapartes,
  gestores,
  empresas,
  statusInicial,
}: {
  empresaId: string;
  contratos: ContratoNaTela[];
  contrapartes: { id: string; razaoSocial: string; cnpjCpf: string }[];
  gestores: { id: string; nome: string }[];
  /** `temCnpj` decide quem pode ASSINAR — ver `opcoesEmpresa` abaixo. */
  empresas: { id: string; nome: string; temCnpj: boolean }[];
  /** Vem da URL — a Central manda "TODOS" para o contrato do alerta aparecer. */
  statusInicial: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [filtroStatus, setFiltroStatus] = useState(statusInicial);
  const [reajuste, setReajuste] = useState<{ id: string; numero: string; data: string; valor: string } | null>(null);
  // A contraparte cadastrada SEM SAIR do formulário de contrato. Antes, quem
  // abria a tela pela primeira vez encontrava o botão "Cadastrar contrato"
  // desabilitado e uma frase mandando cadastrar a contraparte — sem link e sem
  // caminho: a tela não fazia nada na primeira visita, que é exatamente a
  // visita em que ela precisa funcionar.
  const [contraparteNova, setContraparteNova] = useState<Record<string, string> | null>(null);
  const [papeisNovos, setPapeisNovos] = useState<string[]>([]);
  // As que acabaram de nascer aqui. O `router.refresh()` traz a lista do
  // servidor, mas não instantaneamente — sem esta cópia local o <select>
  // ficava um instante apontando para um id que não está nas opções, e o campo
  // aparecia EM BRANCO logo depois de a pessoa cadastrar.
  const [recemCriadas, setRecemCriadas] = useState<{ id: string; razaoSocial: string; cnpjCpf: string }[]>([]);

  const opcoesContraparte = useMemo(() => {
    const jaVeio = new Set(contrapartes.map((c) => c.id));
    return [...contrapartes, ...recemCriadas.filter((c) => !jaVeio.has(c.id))].sort((a, b) =>
      a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"),
    );
  }, [contrapartes, recemCriadas]);

  function aplicarReajuste() {
    if (!reajuste) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarReajusteAplicado({
        empresaId,
        id: reajuste.id,
        aplicadoEm: reajuste.data,
        novoValorMensal: reajuste.valor ? Number(reajuste.valor.replace(",", ".")) : null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setReajuste(null);
      router.refresh();
    });
  }

  // Abre o cadastro rápido da contraparte dentro do formulário do contrato, já
  // com o papel que o tipo do contrato sugere marcado.
  function abrirContraparteNova() {
    setErro(null);
    const sugerido = papelSugeridoPorTipo(form?.tipo);
    setPapeisNovos(sugerido ? [sugerido] : []);
    setContraparteNova({ tipoPessoa: "JURIDICA" });
  }

  function alternarPapelNovo(valor: string) {
    setPapeisNovos((p) => (p.includes(valor) ? p.filter((x) => x !== valor) : [...p, valor]));
  }

  function salvarContraparteNova() {
    if (!contraparteNova) return;
    if (papeisNovos.length === 0) {
      setErro("Marque ao menos um papel — é ele que diz o que esta contraparte é para o grupo.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await salvarContraparte({
        empresaId,
        tipoPessoa: contraparteNova.tipoPessoa || "JURIDICA",
        razaoSocial: contraparteNova.razaoSocial ?? "",
        cnpjCpf: contraparteNova.cnpjCpf ?? "",
        papeis: papeisNovos,
        emailNotificacaoFormal: contraparteNova.emailNotificacaoFormal ?? null,
        telefone: contraparteNova.telefone ?? null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      const id = r.id!;
      setRecemCriadas((l) => [
        ...l,
        { id, razaoSocial: (contraparteNova.razaoSocial ?? "").trim(), cnpjCpf: contraparteNova.cnpjCpf ?? "" },
      ]);
      // O contrato que a pessoa já estava preenchendo continua na tela, agora
      // com a contraparte escolhida: o cadastro rápido não pode custar o que
      // ela digitou antes dele.
      setForm((f) => ({ ...(f ?? {}), contraparteId: id }));
      setContraparteNova(null);
      setPapeisNovos([]);
      router.refresh();
    });
  }

  // "Encerrado" e "cancelado" ficam fora por padrão: contrato morto não some
  // (é prova do que foi combinado, e o prazo de guarda corre do fim), mas
  // também não pode competir por atenção com o que ainda tem prazo correndo.
  const visiveis = useMemo(
    () => (filtroStatus === "TODOS" ? contratos : contratos.filter((c) => c.status === filtroStatus)),
    [contratos, filtroStatus],
  );

  /**
   * Os cinco números do topo — sempre sobre o PRAZO CORRENDO, nunca sobre o
   * filtro de status da tela.
   *
   * A distinção é o ponto: quem abre em "Vigente" e lê "R$ 42.000/mês" precisa
   * poder confiar que é o custo do grupo, e não o custo do recorte que estava
   * aberto. Rascunho, encerrado e cancelado ficam fora pela mesma régua da
   * Central (`STATUS_COM_PRAZO_CORRENDO`), aplicada no servidor.
   */
  const resumo = useMemo(() => {
    let custoMensal = 0;
    let comValor = 0;
    let vencendo90 = 0;
    let denunciaVencida = 0;
    let reajusteAplicar = 0;
    let semGestor = 0;
    let ativos = 0;
    for (const c of contratos) {
      if (!c.prazoCorrendo) continue;
      ativos++;
      if (c.valorMensal !== null) {
        custoMensal += c.valorMensal;
        comValor++;
      }
      if (c.diasParaFim !== null && c.diasParaFim >= 0 && c.diasParaFim <= 90) vencendo90++;
      if (c.diasParaDenuncia !== null && c.diasParaDenuncia < 0) denunciaVencida++;
      if (c.reajusteDevido) reajusteAplicar++;
      if (!c.gestorNome) semGestor++;
    }
    return { custoMensal, comValor, vencendo90, denunciaVencida, reajusteAplicar, semGestor, ativos };
  }, [contratos]);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }
  const marcado = (nome: string) => form?.[nome] === "sim";
  function alternar(nome: string) {
    setForm((f) => ({ ...(f ?? {}), [nome]: f?.[nome] === "sim" ? "" : "sim" }));
  }

  function novo() {
    setErro(null);
    // A empresa da URL só entra pré-escolhida se puder assinar. Estando dentro
    // da "A DEFINIR", o padrão `empresaAlvo: empresaId` apontaria para um id
    // fora das opções: o campo apareceria em branco e o salvar mandaria a
    // empresa provisória assim mesmo, porque o estado guardava o id.
    const daUrl = empresas.find((e) => e.id === empresaId);
    setForm({
      status: "VIGENTE",
      categoria: "DESPESA",
      criticidade: "NORMAL",
      empresaAlvo: daUrl?.temCnpj ? empresaId : "",
    });
    // Grupo sem nenhuma contraparte: o primeiro contrato precisa das duas
    // coisas, e fazer a pessoa adivinhar a ordem era o que travava a tela.
    if (contrapartes.length === 0 && recemCriadas.length === 0) {
      setPapeisNovos([]);
      setContraparteNova({ tipoPessoa: "JURIDICA" });
    }
  }

  // TODOS os campos entram no prefill. Campo fora do formulário na edição é
  // campo apagado no salvar — foi assim que a edição de condutor apagava a
  // validade da CNH de quem só corrigia a categoria.
  function editar(c: ContratoNaTela) {
    setErro(null);
    setForm({
      id: c.id,
      empresaAlvo: c.empresaId,
      numero: c.numero,
      titulo: c.titulo,
      objeto: textoOuTraco(c.objeto),
      contraparteId: c.contraparteId,
      tipo: c.tipo,
      categoria: c.categoria,
      status: c.status,
      criticidade: c.criticidade,
      gestorId: textoOuTraco(c.gestorId),
      dataAssinatura: c.dataAssinaturaInput,
      dataInicio: c.dataInicioInput,
      dataFim: c.dataFimInput,
      indeterminado: c.indeterminado ? "sim" : "",
      renovacaoAutomatica: c.renovacaoAutomatica ? "sim" : "",
      avisoPrevioNaoRenovacaoDias: c.avisoPrevioNaoRenovacaoDias?.toString() ?? "",
      locacaoNaoResidencial: c.locacaoNaoResidencial ? "sim" : "",
      buildToSuit: c.buildToSuit ? "sim" : "",
      renunciaRevisionalPactuada: c.renunciaRevisionalPactuada ? "sim" : "",
      valorMensal: c.valorMensal?.toString() ?? "",
      valorTotal: c.valorTotal?.toString() ?? "",
      indiceReajuste: textoOuTraco(c.indiceReajuste),
      periodicidadeReajusteMeses: c.periodicidadeReajusteMeses?.toString() ?? "",
      mesBaseReajuste: c.mesBaseReajuste?.toString() ?? "",
      multaCompensatoriaPct: c.multaCompensatoriaPct?.toString() ?? "",
      multaMoratoriaPct: c.multaMoratoriaPct?.toString() ?? "",
      foroComarca: textoOuTraco(c.foroComarca),
      foroUf: textoOuTraco(c.foroUf),
      lgpdAplicavel: c.lgpdAplicavel ? "sim" : "",
      pontosFixacaoContratados: c.pontosFixacaoContratados?.toString() ?? "",
      pontosFixacaoOcupados: c.pontosFixacaoOcupados?.toString() ?? "",
      observacoes: textoOuTraco(c.observacoes),
    });
  }

  function salvar() {
    if (!form) return;
    const numero = (v: string | undefined) => (v && v !== "" ? Number(v.replace(",", ".")) : null);
    setErro(null);
    iniciar(async () => {
      const r = await salvarContrato({
        id: form.id || null,
        empresaId,
        // O CNPJ que assina vem do FORMULÁRIO, não da URL: a tela é
        // consolidada, e cadastrar um contrato da empresa B estando na URL da
        // empresa A é o caso normal, não a exceção. O servidor confere se a
        // pessoa alcança esse CNPJ — o <select> aqui só oferece o que ela vê.
        empresaContratoId: form.empresaAlvo || empresaId,
        numero: form.numero ?? "",
        titulo: form.titulo ?? "",
        objeto: form.objeto ?? null,
        contraparteId: form.contraparteId ?? "",
        // Sem `|| "OUTRO"`: quem esquecia de escolher o tipo recebia um contrato
        // classificado como "Outro" sem nenhum aviso. A action recusa o vazio e
        // devolve a frase que diz o que fazer.
        tipo: form.tipo ?? "",
        categoria: form.categoria || "DESPESA",
        status: form.status || "VIGENTE",
        criticidade: form.criticidade || "NORMAL",
        gestorId: form.gestorId || null,
        dataAssinatura: form.dataAssinatura || null,
        dataInicio: form.dataInicio ?? "",
        dataFim: form.dataFim || null,
        indeterminado: form.indeterminado === "sim",
        renovacaoAutomatica: form.renovacaoAutomatica === "sim",
        avisoPrevioNaoRenovacaoDias: numero(form.avisoPrevioNaoRenovacaoDias),
        locacaoNaoResidencial: form.locacaoNaoResidencial === "sim",
        buildToSuit: form.buildToSuit === "sim",
        renunciaRevisionalPactuada: form.renunciaRevisionalPactuada === "sim",
        valorMensal: numero(form.valorMensal),
        valorTotal: numero(form.valorTotal),
        indiceReajuste: form.indiceReajuste || null,
        periodicidadeReajusteMeses: numero(form.periodicidadeReajusteMeses),
        mesBaseReajuste: numero(form.mesBaseReajuste),
        multaCompensatoriaPct: numero(form.multaCompensatoriaPct),
        multaMoratoriaPct: numero(form.multaMoratoriaPct),
        foroComarca: form.foroComarca ?? null,
        foroUf: form.foroUf ?? null,
        lgpdAplicavel: form.lgpdAplicavel === "sim",
        pontosFixacaoContratados: numero(form.pontosFixacaoContratados),
        pontosFixacaoOcupados: numero(form.pontosFixacaoOcupados),
        observacoes: form.observacoes ?? null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  // "Locação de imóvel (receita)" sai da lista: esta tela grava DESPESA ou
  // SEM_VALOR, e o par tipo-receita + natureza-despesa é um contrato que
  // contradiz a si mesmo. Continua visível só se o contrato EM EDIÇÃO já for
  // desse tipo — tirar a opção do <select> de quem edita um caso legado
  // apagaria o tipo dele em silêncio no próximo salvar.
  /**
   * Quem pode assinar: só empresa com CNPJ cadastrado.
   *
   * O grupo mantém empresa PROVISÓRIA sem CNPJ — a "A DEFINIR — frota
   * importada", onde a importação em lote estaciona veículo sem dono. Ela é
   * uma Empresa ativa como outra qualquer, então entrava neste <select> e um
   * contrato cadastrado ali nasceria no CNPJ de ninguém.
   *
   * A empresa do contrato EM EDIÇÃO entra mesmo sem CNPJ: contrato legado
   * precisa continuar abrindo, e sumir a opção de baixo de quem edita deixaria
   * o campo em branco — exatamente o caminho para gravá-lo em outro CNPJ sem
   * querer. Mover para um CNPJ real continua sendo o conserto, e a action
   * recusa o caminho contrário.
   */
  const empresaEmEdicao = form?.id ? form.empresaAlvo : undefined;
  const opcoesEmpresa = useMemo(
    () => empresas.filter((e) => e.temCnpj || e.id === empresaEmEdicao),
    [empresas, empresaEmEdicao],
  );
  // Nomeadas na tela: nada some em silêncio, e o aviso diz o que fazer.
  const semCnpj = useMemo(() => empresas.filter((e) => !e.temCnpj), [empresas]);

  const tipoAtual = form?.tipo ?? "";
  const opcoesTipo =
    tipoAtual && !TIPOS_CONTRATO_DESPESA.some((t) => t.value === tipoAtual)
      ? TIPOS_CONTRATO.filter((t) => t.value === tipoAtual || t.value !== "LOCACAO_IMOVEL")
      : TIPOS_CONTRATO_DESPESA;
  const eLocacao = marcado("locacaoNaoResidencial");
  const ePoste = form?.tipo === "COMPARTILHAMENTO_POSTE";

  // Trocar o tipo (ou desmarcar locação) LIMPA os campos que sumiram da tela.
  // Sem isto o valor continuava no estado e ia junto no salvar: um contrato de
  // fornecedor gravava "40 pontos de fixação contratados", e o dado
  // contradizia o próprio tipo do contrato sem ninguém ver.
  function trocarTipo(valor: string) {
    setForm((f) => ({
      ...(f ?? {}),
      tipo: valor,
      ...(valor === "COMPARTILHAMENTO_POSTE" ? {} : { pontosFixacaoContratados: "", pontosFixacaoOcupados: "" }),
    }));
  }
  function alternarLocacao() {
    setForm((f) => {
      const virandoLocacao = f?.locacaoNaoResidencial !== "sim";
      return {
        ...(f ?? {}),
        locacaoNaoResidencial: virandoLocacao ? "sim" : "",
        ...(virandoLocacao ? {} : { buildToSuit: "", renunciaRevisionalPactuada: "" }),
      };
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="TODOS">Todos os status</option>
          {STATUS_CONTRATO.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" className="gap-2" onClick={novo}>
          <Plus className="size-4" />
          Cadastrar contrato
        </Button>
      </div>

      {/* Na tela vazia a faixa seria cinco zeros explicando nada: quem chega
          aqui pela primeira vez precisa do caminho, não do painel. */}
      {contratos.length > 0 && (
        <FaixaDeIndicadores colunas={5}>
          <Indicador
            rotulo="Custo mensal"
            valor={formatarReais(resumo.custoMensal)}
            complemento={
              resumo.ativos === 0
                ? "nenhum contrato com prazo correndo"
                : `${resumo.comValor} de ${resumo.ativos} contrato(s) com valor informado`
            }
          />
          <Indicador
            rotulo="Vencem em 90 dias"
            valor={resumo.vencendo90}
            complemento="fim da vigência se aproximando"
            estado={resumo.vencendo90 > 0 ? "atencao" : "padrao"}
          />
          <Indicador
            rotulo="Decisão vencida"
            valor={resumo.denunciaVencida}
            complemento="passou a data de avisar que não renova"
            estado={resumo.denunciaVencida > 0 ? "alerta" : "padrao"}
          />
          <Indicador
            rotulo="Reajuste a aplicar"
            valor={resumo.reajusteAplicar}
            complemento="mês-base já chegou"
            estado={resumo.reajusteAplicar > 0 ? "atencao" : "padrao"}
          />
          <Indicador
            rotulo="Sem gestor"
            valor={resumo.semGestor}
            complemento="pendência que nasce sem dono"
            estado={resumo.semGestor > 0 ? "atencao" : "padrao"}
          />
        </FaixaDeIndicadores>
      )}

      {reajuste && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aplicar reajuste — {reajuste.numero}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
              Registrar aqui fecha a pendência e reagenda o próximo reajuste a partir desta data. Sem
              isso, o alerta deste contrato ficaria vencido para sempre.
            </p>
            <label className="text-xs text-muted-foreground">
              Passou a valer em
              <input
                type="date"
                value={reajuste.data}
                onChange={(e) => setReajuste({ ...reajuste, data: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Novo valor mensal (R$)
              <input
                type="number"
                step="0.01"
                value={reajuste.valor}
                onChange={(e) => setReajuste({ ...reajuste, valor: e.target.value })}
                className={CAMPO}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Em branco mantém o valor atual.
              </span>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" disabled={pendente} onClick={aplicarReajuste}>Registrar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setReajuste(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{form.id ? "Editar contrato" : "Cadastrar contrato"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className={SECAO}>Identificação</p>
            <label className="text-xs text-muted-foreground">
              Empresa (CNPJ que assina)
              <select {...campo("empresaAlvo")} className={CAMPO}>
                <option value="">Escolha…</option>
                {opcoesEmpresa.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              {form.id && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Dá para corrigir: contrato não se apaga, então o CNPJ errado precisa ter conserto.
                </span>
              )}
              {semCnpj.length > 0 && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  Fora da lista por não ter CNPJ cadastrado:{" "}
                  {semCnpj.map((e) => e.nome).join(", ")}. Quem assina contrato precisa de CNPJ —
                  complete em Cadastros › Empresas (é preciso ser administrador).
                </span>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Número
              <input {...campo("numero")} className={CAMPO} placeholder="CT-2026-014" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Título
              <input {...campo("titulo")} className={CAMPO} placeholder="Locação da torre — Sítio Boa Vista" />
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2">
              Contraparte (quem assina do outro lado)
              <select
                value={form.contraparteId ?? ""}
                onChange={(e) =>
                  e.target.value === NOVA_CONTRAPARTE
                    ? abrirContraparteNova()
                    : setForm((f) => ({ ...(f ?? {}), contraparteId: e.target.value }))
                }
                className={CAMPO}
                disabled={contraparteNova !== null}
              >
                <option value="">Escolha…</option>
                {opcoesContraparte.map((c) => (
                  <option key={c.id} value={c.id}>{c.razaoSocial}</option>
                ))}
                <option value={NOVA_CONTRAPARTE}>+ Cadastrar nova contraparte…</option>
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                É do grupo inteiro: o mesmo fornecedor ou locador serve a todos os CNPJs, sem
                recadastrar. Para completar endereço e observações,{" "}
                <Link
                  href={`/processos/${empresaId}/contratos/contrapartes`}
                  className="underline underline-offset-2"
                >
                  abra o cadastro de contrapartes
                </Link>
                .
              </span>
            </label>
            {contraparteNova && (
              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:col-span-2 lg:col-span-4">
                  Nova contraparte
                </p>
                <label className="text-xs text-muted-foreground">
                  Tipo
                  <select
                    value={contraparteNova.tipoPessoa ?? "JURIDICA"}
                    onChange={(e) => setContraparteNova({ ...contraparteNova, tipoPessoa: e.target.value })}
                    className={CAMPO}
                  >
                    {TIPOS_PESSOA.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  CNPJ / CPF
                  <input
                    value={contraparteNova.cnpjCpf ?? ""}
                    onChange={(e) => setContraparteNova({ ...contraparteNova, cnpjCpf: e.target.value })}
                    className={CAMPO}
                    placeholder="Só os números"
                  />
                </label>
                <label className="text-xs text-muted-foreground sm:col-span-2">
                  Razão social / nome
                  <input
                    value={contraparteNova.razaoSocial ?? ""}
                    onChange={(e) => setContraparteNova({ ...contraparteNova, razaoSocial: e.target.value })}
                    className={CAMPO}
                  />
                </label>
                <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                  Papéis
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                    {PAPEIS_CONTRAPARTE.map((pp) => (
                      <label key={pp.value} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={papeisNovos.includes(pp.value)}
                          onChange={() => alternarPapelNovo(pp.value)}
                          className="size-4"
                        />
                        {pp.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="text-xs text-muted-foreground sm:col-span-2">
                  E-mail para notificação formal
                  <input
                    type="email"
                    value={contraparteNova.emailNotificacaoFormal ?? ""}
                    onChange={(e) =>
                      setContraparteNova({ ...contraparteNova, emailNotificacaoFormal: e.target.value })
                    }
                    className={CAMPO}
                  />
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                    É para cá que vai o aviso de não-renovação. Endereço errado aqui é prazo
                    cumprido que não vale.
                  </span>
                </label>
                <label className="text-xs text-muted-foreground">
                  Telefone
                  <input
                    value={contraparteNova.telefone ?? ""}
                    onChange={(e) => setContraparteNova({ ...contraparteNova, telefone: e.target.value })}
                    className={CAMPO}
                  />
                </label>
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                  <Button size="sm" variant="outline" disabled={pendente} onClick={salvarContraparteNova}>
                    Salvar contraparte
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setContraparteNova(null); setPapeisNovos([]); setErro(null); }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            <label className="text-xs text-muted-foreground">
              Tipo
              <select
                value={form.tipo ?? ""}
                onChange={(e) => trocarTipo(e.target.value)}
                className={CAMPO}
              >
                <option value="">Escolha…</option>
                {opcoesTipo.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Natureza
              <select {...campo("categoria")} className={CAMPO}>
                {/* Receita sai das opções: aluguel a receber se cadastra na
                    tela de Aluguéis (decisão do dono, 27/08/2026). */}
                {CATEGORIAS_CONTRATO.filter((c) => c.value !== "RECEITA").map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Status
              <select {...campo("status")} className={CAMPO}>
                {STATUS_CONTRATO.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Criticidade
              <select {...campo("criticidade")} className={CAMPO}>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Gestor responsável
              <select {...campo("gestorId")} className={CAMPO}>
                <option value="">Sem gestor</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Vira o dono das pendências deste contrato na Central.
              </span>
            </label>
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Objeto
              <textarea {...campo("objeto")} rows={2} className={CAMPO} />
            </label>

            <p className={SECAO}>Vigência</p>
            <label className="text-xs text-muted-foreground">
              Assinatura
              <input {...campo("dataAssinatura")} type="date" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Início da vigência
              <input {...campo("dataInicio")} type="date" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Fim da vigência
              <input {...campo("dataFim")} type="date" className={CAMPO} disabled={marcado("indeterminado")} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("indeterminado")}
                onChange={() => alternar("indeterminado")}
                className="size-4"
              />
              Prazo indeterminado
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("renovacaoAutomatica")}
                onChange={() => alternar("renovacaoAutomatica")}
                className="size-4"
              />
              Renova automaticamente
            </label>
            <label className="text-xs text-muted-foreground">
              Aviso prévio de não-renovação (dias)
              <input {...campo("avisoPrevioNaoRenovacaoDias")} type="number" min={1} className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Copie da cláusula. É daqui que sai a data-limite para dizer que não renova — se ela
                couber dentro da vigência.
              </span>
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={eLocacao}
                onChange={alternarLocacao}
                className="size-4"
              />
              Locação não residencial
            </label>
            {eLocacao && (
              <>
                <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
                  A janela da ação renovatória (12 a 6 meses antes do fim) é calculada sozinha a
                  partir da data de fim. Perdida, o direito decai — não se suspende nem se
                  interrompe, nem com negociação em andamento (Lei 8.245/1991, art. 51, §5º).
                </p>
                <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={marcado("buildToSuit")}
                    onChange={() => alternar("buildToSuit")}
                    className="size-4"
                  />
                  Build to suit (art. 54-A)
                </label>
                <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={marcado("renunciaRevisionalPactuada")}
                    onChange={() => alternar("renunciaRevisionalPactuada")}
                    className="size-4"
                  />
                  Renúncia ao direito de revisão pactuada
                </label>
              </>
            )}

            <p className={SECAO}>Financeiro e reajuste</p>
            <label className="text-xs text-muted-foreground">
              Valor mensal (R$)
              <input {...campo("valorMensal")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor total (R$)
              <input {...campo("valorTotal")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Índice de reajuste
              <select {...campo("indiceReajuste")} className={CAMPO}>
                <option value="">Não informado</option>
                {INDICES_REAJUSTE.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Periodicidade (meses)
              <input {...campo("periodicidadeReajusteMeses")} type="number" min={12} className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Mínimo 12 — abaixo disso a cláusula é nula (Lei 10.192/2001, art. 2º, §1º).
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Mês-base do reajuste
              <select {...campo("mesBaseReajuste")} className={CAMPO}>
                <option value="">Não informado</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>

            <p className={SECAO}>Jurídico</p>
            <label className="text-xs text-muted-foreground">
              Multa compensatória (%)
              <input {...campo("multaCompensatoriaPct")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Multa moratória (%)
              <input {...campo("multaMoratoriaPct")} type="number" step="0.01" className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Foro — comarca
              <input {...campo("foroComarca")} className={CAMPO} />
            </label>
            <label className="text-xs text-muted-foreground">
              Foro — UF
              <input {...campo("foroUf")} className={CAMPO} maxLength={2} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marcado("lgpdAplicavel")}
                onChange={() => alternar("lgpdAplicavel")}
                className="size-4"
              />
              Há tratamento de dados pessoais
            </label>
            {ePoste && (
              <>
                <label className="text-xs text-muted-foreground">
                  Pontos de fixação contratados
                  <input {...campo("pontosFixacaoContratados")} type="number" min={0} className={CAMPO} />
                </label>
                <label className="text-xs text-muted-foreground">
                  Pontos de fixação ocupados
                  <input {...campo("pontosFixacaoOcupados")} type="number" min={0} className={CAMPO} />
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                    Ocupar mais que o contratado é a origem da cobrança retroativa da distribuidora.
                  </span>
                </label>
              </>
            )}
            <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Observações
              <textarea {...campo("observacoes")} rows={2} className={CAMPO} />
            </label>

            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente || contraparteNova !== null} onClick={salvar}>Salvar</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setForm(null); setContraparteNova(null); setPapeisNovos([]); setErro(null); }}
              >
                Cancelar
              </Button>
              {contraparteNova !== null && (
                <span className="text-[11px] text-muted-foreground">
                  Salve ou cancele a nova contraparte antes de salvar o contrato.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Vigência até</TableHead>
                <TableHead>Decidir renovação</TableHead>
                <TableHead className="text-right">Valor/mês</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {contratos.length === 0 ? (
                      <>
                        <span className="block">
                          Nenhum contrato cadastrado. Sem contrato cadastrado, nenhum prazo de
                          renovação é cobrado.
                        </span>
                        <span className="mt-1 block text-[11px]">
                          Aqui entra o que o grupo CONTRATA — torre, terreno, poste, prefeitura,
                          fornecedor, prestador. Imóvel do grupo alugado a terceiro vive em{" "}
                          <Link
                            href={`/processos/${empresaId}/alugueis`}
                            className="underline underline-offset-2"
                          >
                            Aluguéis a receber
                          </Link>
                          .
                        </span>
                        <Button size="sm" className="mt-3 gap-2" onClick={novo}>
                          <Plus className="size-4" />
                          Cadastrar o primeiro contrato
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="block">Nenhum contrato com este status.</span>
                        {filtroStatus !== "TODOS" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2"
                            onClick={() => setFiltroStatus("TODOS")}
                          >
                            Ver todos os {contratos.length} contrato(s)
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="font-medium">{c.numero}</span>
                    <span className="block text-xs text-muted-foreground">{c.titulo}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <Badge variant="secondary">{rotulo(TIPOS_CONTRATO, c.tipo)}</Badge>
                      {c.status !== "VIGENTE" && (
                        <Badge variant="outline">{rotulo(STATUS_CONTRATO, c.status)}</Badge>
                      )}
                      {c.criticidade === "ALTA" && <Badge variant="destructive">Crítico</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.contraparteNome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.empresaNome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.gestorNome ?? <span className="text-muted-foreground">sem gestor</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular-nums",
                      c.diasParaFim !== null && c.diasParaFim < 0 && "font-semibold text-destructive",
                      // Vencendo é MAIS pesado que o normal, não menos. Até aqui
                      // esta linha era `text-muted-foreground`: o contrato que
                      // exige decisão neste trimestre saía mais apagado que o que
                      // vence daqui a três anos, porque a célula sem classe herda
                      // `foreground` e o muted é mais claro. A tela existe para
                      // mostrar o que tem prazo correndo; ela estava escondendo.
                      c.diasParaFim !== null && c.diasParaFim >= 0 && c.diasParaFim <= 90 &&
                        "font-medium",
                    )}
                  >
                    {c.dataFimTexto}
                    <PrazoRestante dias={c.diasParaFim} limite={90} />
                    {c.janelaRenovatoriaFimTexto && (
                      <span className="block text-[11px] text-muted-foreground">
                        renovatória até {c.janelaRenovatoriaFimTexto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {c.dataLimiteDenunciaTexto ? (
                      <>
                        <span
                          className={cn(
                            c.diasParaDenuncia !== null && c.diasParaDenuncia < 0 &&
                              "font-semibold text-destructive",
                            // Mesma inversão da coluna ao lado, mesmo conserto.
                            c.diasParaDenuncia !== null && c.diasParaDenuncia >= 0 &&
                              c.diasParaDenuncia <= 30 && "font-medium",
                          )}
                        >
                          {c.dataLimiteDenunciaTexto}
                        </span>
                        <PrazoRestante dias={c.diasParaDenuncia} limite={30} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {c.renovacaoAutomatica && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <TriangleAlert className="size-3" />
                        renova sozinho
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.valorMensal !== null ? formatarReais(c.valorMensal) : "—"}
                    {c.proximoReajusteTexto && (
                      <span className="block text-[11px] text-muted-foreground">
                        reajuste em {c.proximoReajusteTexto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {c.reajusteDevido && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1 gap-1"
                        onClick={() =>
                          setReajuste({
                            id: c.id,
                            numero: c.numero,
                            data: c.proximoReajusteInput,
                            valor: c.valorMensalInput,
                          })
                        }
                      >
                        <TrendingUp className="size-4" />
                        Aplicar reajuste
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => editar(c)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
