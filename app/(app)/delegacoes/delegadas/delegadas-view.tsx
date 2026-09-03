"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { criarDemanda } from "@/lib/actions/delegacoes";
import { rascunharComIA } from "@/lib/actions/delegacoes-ia";
import { alternarFavorito } from "@/lib/actions/delegacoes";
import { Sparkles, Star } from "lucide-react";
import {
  OPCOES_CRITICIDADE,
  OPCOES_EVIDENCIA,
  OPCOES_PERIODICIDADE,
} from "@/lib/constants-delegacoes";
import { TITULO_MAXIMO } from "@/lib/delegacoes/estados";
import type { DemandaNaTela } from "@/lib/delegacoes/consultas";
import type { Painel } from "@/lib/delegacoes/painel-entregas";
import { cn } from "@/lib/utils";
import { LinhaDemanda } from "../linha-demanda";
import { TabelaEntregas } from "../tabela-entregas";

// Mesmas duas constantes de classe do módulo de Processos (contratos-view.tsx,
// veiculos-view.tsx, alugueis-view.tsx). Campo nativo com `CAMPO`, não os
// componentes de components/ui — misturar os dois na mesma grade desalinha,
// porque têm alturas e raios diferentes.
const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const SECAO = "sm:col-span-2 lg:col-span-4 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

/**
 * Quem pode receber demanda. `tipo` decide o CAMPO que a action recebe: um
 * usuário do sistema vai em `responsavelId`; um funcionário sem login vai em
 * `responsavelColaboradorId`, e o acesso de portal dele é criado na hora.
 */
type UsuarioOpcao = {
  tipo: "USUARIO" | "COLABORADOR";
  /**
   * `true` quando `id` é de uma FICHA (pessoa que ainda não recebeu demanda
   * nenhuma). Depois da primeira, ela passa a ter acesso de portal e o id vira
   * de USUÁRIO — continuando "Colaborador" aos olhos de quem delega. Sem esta
   * distinção a tela manda um id no campo do outro, e a action não acha nada.
   */
  idEhFicha: boolean;
  id: string;
  nome: string;
  temTelegram: boolean;
  favorito: boolean;
  /** Cargo do colaborador (Posicao.nome) — null quando não há ficha ligada. */
  cargo: string | null;
  /** Marca da empresa da ficha — null quando não há ficha ligada. */
  marcaNome: string | null;
};

/**
 * Como a pessoa aparece na lista: estrela do favorito, a etiqueta do tipo, a
 * MARCA na frente do nome, o nome, e o cargo por último — pedido da Direção
 * em 29/08/2026. Marca e cargo faltam para quem não tem ficha ligada (contas
 * puras do sistema), e o rótulo some com elas de mansinho.
 */
function rotuloPessoa(u: UsuarioOpcao): string {
  const estrela = u.favorito ? "★ " : "";
  const tipo = u.tipo === "USUARIO" ? "[Usuário]" : "[Colaborador]";
  const marca = u.marcaNome ? `${u.marcaNome} · ` : "";
  const cargo = u.cargo ? ` — ${u.cargo}` : "";
  return `${estrela}${tipo} ${marca}${u.nome}${cargo}`;
}

// Mesma normalização do slug de vaga (lib/constants-ats.ts): NFD separa o
// acento e \p{M} o derruba — "Á" casa com "a". Sem isto, pesquisar "jose" não
// acha "José", e metade do quadro tem acento no nome.
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Quantas pessoas a pesquisa mostra por vez — o resto pede mais letras. */
const MAX_RESULTADOS_BUSCA = 30;

/** O formulário nasce com estes valores — os mesmos padrões da spec. */
const FORM_VAZIO: Record<string, string> = {
  titulo: "",
  descricao: "",
  responsavelId: "",
  criterioAceite: "",
  evidenciaExigida: "TEXTO",
  criticidade: "3",
  prazo: "",
  horasEstimadas: "",
  periodicidadeRetorno: "SEMANAL",
  marcaId: "",
  area: "",
};

export function DelegadasView({
  demandas,
  painel,
  usuarios,
  marcas,
}: {
  demandas: DemandaNaTela[];
  painel: Painel;
  usuarios: UsuarioOpcao[];
  marcas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // O caminho principal: a pessoa e o contexto. Os nove campos continuam
  // existindo — mas como CONFERÊNCIA do que a IA montou, não como digitação.
  const [contexto, setContexto] = useState("");
  const [assumiu, setAssumiu] = useState<string[]>([]);
  const [pensando, setPensando] = useState(false);
  // Enquanto o formulário não existe, o responsável mora no campo da IA.
  const [responsavelIA, setResponsavelIA] = useState("");
  const [editandoFavoritos, setEditandoFavoritos] = useState(false);
  const [buscaFavoritos, setBuscaFavoritos] = useState("");

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm((f) => (f ? { ...f, [nome]: e.target.value } : f)),
    };
  }

  function abrir() {
    setErro(null);
    setAviso(null);
    setAssumiu([]);
    setForm({ ...FORM_VAZIO });
  }

  function fechar() {
    setForm(null);
    setErro(null);
    setAssumiu([]);
  }

  /**
   * O botão que faz o trabalho: manda a pessoa e o contexto, recebe a demanda
   * inteira montada e abre o formulário JÁ PREENCHIDO. Nada é gravado aqui —
   * o compromisso (prazo e critério de aceite) passa pelos olhos de quem
   * delega antes de existir, porque é dele que vão cobrar depois.
   */
  function montarComIA() {
    if (!responsavelIA || contexto.trim().length < 10) {
      setErro("Escolha a pessoa e escreva o contexto — pelo menos uma frase.");
      return;
    }
    setErro(null);
    setAviso(null);
    setPensando(true);
    iniciar(async () => {
      const alvo = usuarios.find((u) => u.id === responsavelIA);
      const r = await rascunharComIA({
        responsavelId: responsavelIA,
        idEhFicha: alvo?.idEhFicha,
        contexto,
      });
      setPensando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const p = r.proposta;
      setAssumiu(p.assumiu);
      setForm({
        titulo: p.titulo,
        descricao: p.descricao,
        responsavelId: responsavelIA,
        criterioAceite: p.criterioAceite,
        evidenciaExigida: p.evidenciaExigida,
        criticidade: String(p.criticidade),
        prazo: p.prazo,
        horasEstimadas: String(p.horasEstimadas),
        periodicidadeRetorno: p.periodicidadeRetorno,
        marcaId: marcas.find((m) => m.nome === p.marcaNome)?.id ?? "",
        area: p.area ?? "",
      });
    });
  }

  function favoritar(u: UsuarioOpcao) {
    setErro(null);
    iniciar(async () => {
      const r = await alternarFavorito({
        favoritoId: u.id,
        // Ficha ainda sem acesso de portal: o id é o da FICHA, e a action
        // cria o acesso antes de favoritar.
        ehColaborador: u.idEhFicha,
        favoritar: !u.favorito,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      router.refresh();
    });
  }

  /** Uma linha do gerenciador — nome à esquerda (marca na frente, cargo depois), estrela à direita. */
  function linhaFavorito(u: UsuarioOpcao) {
    return (
      <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="truncate text-sm">
          <span className="text-xs text-muted-foreground">
            {u.tipo === "USUARIO" ? "Usuário" : "Colaborador"}
          </span>{" "}
          {u.marcaNome && <span className="text-xs text-muted-foreground">{u.marcaNome} · </span>}
          {u.nome}
          {u.cargo && <span className="text-xs text-muted-foreground"> — {u.cargo}</span>}
        </span>
        <button
          type="button"
          disabled={pendente}
          onClick={() => favoritar(u)}
          aria-pressed={u.favorito}
          title={u.favorito ? "Tirar dos favoritos" : "Pôr nos favoritos"}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Star className={cn("size-4", u.favorito && "fill-muted-foreground text-muted-foreground")} />
        </button>
      </div>
    );
  }

  function salvar(enviar: boolean) {
    if (!form) return;
    setErro(null);
    iniciar(async () => {
      const escolhido = usuarios.find((u) => u.id === form.responsavelId);
      const r = await criarDemanda({
        titulo: form.titulo,
        descricao: form.descricao,
        ...(escolhido?.idEhFicha
          ? { responsavelColaboradorId: form.responsavelId }
          : { responsavelId: form.responsavelId }),
        criterioAceite: form.criterioAceite,
        evidenciaExigida: form.evidenciaExigida,
        criticidade: Number(form.criticidade || "3"),
        prazo: form.prazo,
        horasEstimadas: form.horasEstimadas ? Number(form.horasEstimadas) : undefined,
        periodicidadeRetorno: form.periodicidadeRetorno,
        marcaId: form.marcaId || null,
        area: form.area,
        enviar,
      });
      if (!r.ok) {
        // O formulário CONTINUA aberto com o que a pessoa digitou.
        setErro(r.error);
        return;
      }
      setForm(null);
      setAssumiu([]);
      setContexto("");
      // O aviso de Telegram persiste depois de fechar o formulário: é
      // informação sobre o que o sistema ainda não vai conseguir fazer, e
      // escondê-la junto com o formulário seria omitir.
      setAviso(r.avisoTelegram ?? null);
      // Rascunho leva direto ao detalhe: é lá que mora o "Enviar ao
      // responsável", e voltar para a lista deixaria a pessoa procurando.
      if (!enviar && r.id) {
        router.push(`/delegacoes/${r.id}`);
        return;
      }
      router.refresh();
    });
  }

  const favoritos = usuarios.filter((u) => u.favorito);
  // A pesquisa do gerenciador: os favoritos ficam FIXADOS no topo (à mão para
  // desmarcar) e o resto do quadro — centenas de pessoas — só aparece pelo que
  // se digita. Antes a lista inteira era o único caminho até a estrela.
  const buscaLimpa = semAcento(buscaFavoritos.trim());
  const encontrados = buscaLimpa
    ? usuarios.filter((u) => !u.favorito && semAcento(u.nome).includes(buscaLimpa))
    : [];
  const responsavelEscolhido = usuarios.find((u) => u.id === (form?.responsavelId ?? responsavelIA));
  const aguardandoMeuAceite = demandas.filter((d) => d.status === "ENTREGUE");
  const rascunhos = demandas.filter((d) => d.status === "RASCUNHO");
  const emAndamento = demandas.filter((d) => d.status !== "ENTREGUE" && d.status !== "RASCUNHO");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Delegações
          </p>
          <h1>Delegadas por mim</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que você pediu e ainda não recebeu de volta. Só você encerra uma demanda sua.
          </p>
        </div>
      </div>

      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {aviso}
        </p>
      )}

      {/* O CAMINHO PRINCIPAL. Duas coisas: para quem, e o que você quer. A IA
          monta o resto e mostra o que assumiu, para virar compromisso só
          depois de alguém olhar. */}
      {!form && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              Delegar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Para quem</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => {
                    setBuscaFavoritos("");
                    setEditandoFavoritos((v) => !v);
                  }}
                >
                  {editandoFavoritos ? "Concluir" : "Escolher favoritos"}
                </button>
              </div>

              {/* Os favoritos como atalho: quem delega manda para as MESMAS
                  pessoas o dia inteiro, e caçá-las numa lista alfabética a cada
                  demanda é o atrito que faz o produto perder para o WhatsApp. */}
              {favoritos.length > 0 && !editandoFavoritos && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {favoritos.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setResponsavelIA(u.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        responsavelIA === u.id
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {u.nome}
                    </button>
                  ))}
                </div>
              )}

              {/* O gerenciador: pesquisa em cima, favoritos fixados no topo da
                  lista, resultados embaixo. Fica escondido até alguém pedir — a
                  tela do dia a dia é a de delegar, não a de configurar. */}
              {editandoFavoritos && (
                <div className="mb-2 rounded-md border border-border">
                  <div className="border-b border-border p-2">
                    <input
                      className={CAMPO}
                      autoFocus
                      placeholder={`Pesquisar pelo nome — ${usuarios.length} pessoas`}
                      value={buscaFavoritos}
                      onChange={(e) => setBuscaFavoritos(e.target.value)}
                    />
                  </div>
                  <div className="max-h-72 divide-y overflow-y-auto">
                    {favoritos.map((u) => linhaFavorito(u))}
                    {encontrados.slice(0, MAX_RESULTADOS_BUSCA).map((u) => linhaFavorito(u))}
                  </div>
                  {encontrados.length > MAX_RESULTADOS_BUSCA && (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Mostrando {MAX_RESULTADOS_BUSCA} de {encontrados.length} — escreva mais
                      uma parte do nome para afunilar.
                    </p>
                  )}
                  {buscaLimpa && encontrados.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      Ninguém com esse nome fora dos favoritos.
                    </p>
                  )}
                  {!buscaLimpa && favoritos.length === 0 && usuarios.length > 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      Nenhum favorito ainda. Pesquise pelo nome e toque na estrela — a pessoa
                      passa a aparecer como atalho na hora de delegar.
                    </p>
                  )}
                  {usuarios.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      Ninguém além de você alcança o módulo ainda. Libere as pessoas em
                      Usuários e perfis para poder delegar a elas.
                    </p>
                  )}
                </div>
              )}

              <select
                className={CAMPO + " sm:max-w-sm"}
                value={responsavelIA}
                onChange={(e) => setResponsavelIA(e.target.value)}
              >
                <option value="">Escolha uma pessoa</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {/* A etiqueta vem NA FRENTE (pedido da Direção): num
                        `<select>` nativo o nome pode truncar no celular e o
                        sufixo é a primeira coisa a sumir — justamente a
                        informação que muda por onde a pessoa vai responder. */}
                    {rotuloPessoa(u)}
                  </option>
                ))}
              </select>
              {responsavelEscolhido && !responsavelEscolhido.temTelegram && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {responsavelEscolhido.tipo === "COLABORADOR"
                    ? "Sem Telegram vinculado — e é por ele que essa pessoa entra no portal. Ela precisa enviar /start ao bot do RH antes de conseguir responder."
                    : "Sem Telegram vinculado — quando a cobrança automática entrar no ar, ela não vai alcançar essa pessoa por lá."}
                </span>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">O que você precisa</span>
              <textarea
                className={CAMPO}
                rows={3}
                placeholder="Escreva como você falaria. Ex.: preciso do orçamento do gerador da torre 12, pelo menos três fornecedores, até sexta."
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                A IA monta o título, o critério de aceite, o prazo e o resto — e mostra o que
                assumiu antes de você delegar.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button disabled={pendente} onClick={montarComIA}>
                {pensando ? "Montando…" : "Montar com IA"}
              </Button>
              <Button variant="ghost" onClick={abrir}>
                Preencher à mão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {form && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {assumiu.length > 0 || form.titulo ? "Confira antes de delegar" : "Nova demanda"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* A honestidade da IA, à vista: o que ela preencheu sem você ter
                dito. É o que separa "a IA fez o trabalho" de "a IA assumiu um
                compromisso no seu lugar". */}
            {assumiu.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 sm:col-span-2 lg:col-span-4">
                <p className="text-xs font-medium text-foreground">A IA assumiu:</p>
                <ul className="mt-1 space-y-0.5">
                  {assumiu.map((a, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">O que precisa acontecer</span>
              <input className={CAMPO} maxLength={TITULO_MAXIMO} required {...campo("titulo")} />
            </label>

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">Contexto (opcional)</span>
              <textarea className={CAMPO} rows={2} {...campo("descricao")} />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Responsável</span>
              {/* Os mesmos atalhos do caminho da IA: quem preenche à mão também
                  delega para as mesmas pessoas o dia inteiro. */}
              {favoritos.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {favoritos.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setForm((f) => (f ? { ...f, responsavelId: u.id } : f))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        form.responsavelId === u.id
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {u.nome}
                    </button>
                  ))}
                </div>
              )}
              <select className={CAMPO} required {...campo("responsavelId")}>
                <option value="">Escolha uma pessoa</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {rotuloPessoa(u)}
                  </option>
                ))}
              </select>
              {/* O aviso da decisão da Direção: delegar para quem não tem
                  Telegram é PERMITIDO, e a pessoa precisa saber o que muda. */}
              {responsavelEscolhido && !responsavelEscolhido.temTelegram && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Sem Telegram vinculado — quando a cobrança automática entrar no ar, ela não
                  vai alcançar essa pessoa por lá.
                </span>
              )}
            </label>

            <label>
              <span className="mb-1 block text-xs text-muted-foreground">Prazo</span>
              <input type="date" className={CAMPO} required {...campo("prazo")} />
              <span className="mt-1 block text-xs text-muted-foreground">
                Vale até o fim do dia.
              </span>
            </label>

            <label>
              <span className="mb-1 block text-xs text-muted-foreground">Criticidade</span>
              <select className={CAMPO} {...campo("criticidade")}>
                {OPCOES_CRITICIDADE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs text-muted-foreground">Horas estimadas</span>
              <input type="number" min="0.5" step="0.5" className={CAMPO} {...campo("horasEstimadas")} />
              <span className="mt-1 block text-xs text-muted-foreground">
                Esforço esperado — não é a data limite, é quanto trabalho isso deve levar.
              </span>
            </label>

            <p className={SECAO}>Como vamos saber que ficou pronto</p>

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">
                Critério de aceite — obrigatório
              </span>
              <textarea
                className={CAMPO}
                rows={2}
                required
                placeholder="Ex.: três orçamentos comparados, com prazo de entrega de cada fornecedor"
                {...campo("criterioAceite")}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Sem isto a demanda não é salva. É o que decide, depois, se a entrega vale.
              </span>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Evidência exigida</span>
              <select className={CAMPO} {...campo("evidenciaExigida")}>
                {OPCOES_EVIDENCIA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Na entrega o sistema vai exigir {OPCOES_EVIDENCIA.find((o) => o.value === form.evidenciaExigida)?.ajuda}.
              </span>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Quero retorno</span>
              <select className={CAMPO} {...campo("periodicidadeRetorno")}>
                {OPCOES_PERIODICIDADE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <p className={SECAO}>Para achar depois (opcional)</p>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Empresa</span>
              <select className={CAMPO} {...campo("marcaId")}>
                <option value="">Não se aplica a uma empresa</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Área</span>
              <input className={CAMPO} maxLength={60} {...campo("area")} />
            </label>

            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <Button disabled={pendente} onClick={() => salvar(true)}>
                Delegar agora
              </Button>
              {/* Rascunho existe porque a spec tem o estado — serve para montar
                  a demanda sem disparar o relógio do aceite. */}
              <Button variant="outline" disabled={pendente} onClick={() => salvar(false)}>
                Salvar rascunho
              </Button>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <TabelaEntregas
        painel={painel}
        titulo="Como andam as entregas"
        descricao={
          <>
            Por pessoa, sobre tudo que você já delegou. &quot;Tempo até entregar&quot; conta do
            aceite até a entrega — é tempo corrido com a demanda na mão, não apontamento de horas
            trabalhadas, que o sistema não tem. &quot;Horas estimadas&quot; é o que se planejou
            antes de começar (a IA sugere, você confirma ao delegar); &quot;dentro da
            estimativa&quot; só conta entre as entregas que têm os dois números.
          </>
        }
      />

      {aguardandoMeuAceite.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Entregues — esperando você
              <Badge variant="outline">{aguardandoMeuAceite.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {aguardandoMeuAceite.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {rascunhos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Rascunhos — ainda não enviados
              <Badge variant="outline">{rascunhos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {rascunhos.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {emAndamento.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Em andamento
              <Badge variant="outline">{emAndamento.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {emAndamento.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {demandas.length === 0 && !form && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">Você ainda não delegou nada por aqui.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao delegar, o combinado e o prazo ficam registrados aqui.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
