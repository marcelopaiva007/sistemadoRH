// Cobertura do ciclo de avaliação — placar por CNPJ + gap autoavaliação × gestor.
//
// Por que existe: "240 pendentes" lidos como um número só parecem ciclo
// travado. Separando de quem é cada fila, metade é autoavaliação (trabalho do
// próprio colaborador) e a fila real de gestor se concentra em pouquíssimas
// pessoas — o problema é o DESENHO do ciclo (curto, com avaliadores
// sobrecarregados), não gente enrolando. Este motor entrega essa separação
// pronta, mais a métrica que já dá para extrair hoje: o gap entre como a
// pessoa se vê e como o gestor a vê. Gap alto individual é expectativa
// desalinhada (preditor de saída, gatilho de conversa); gap alto consistente
// na equipe de um líder sugere feedback que não está chegando.
//
// Funções puras — recebem as linhas já buscadas pelo Server Component e
// devolvem dados prontos para a tela. Nada aqui toca o Prisma (contrato de
// lib/bi.ts).
import { diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";

// ---------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------

export type CicloParaCobertura = {
  id: string;
  empresaId: string;
  nome: string;
  dataInicio: Date;
  dataFim: Date;
  encerrado: boolean;
};

export type AvaliacaoParaCobertura = {
  empresaId: string;
  cicloId: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** AUTOAVALIACAO | GESTOR | PAR | SUBORDINADO (texto livre no banco). */
  tipoAvaliador: string;
  avaliadorId: string;
  avaliadorNome: string | null;
  /** PENDENTE | CONCLUIDA. */
  status: string;
  notaFinal: number | null;
  potencial: string | null;
};

export type EmpresaParaCobertura = { id: string; nome: string; ativos: number };

// ---------------------------------------------------------------
// Campanha atual
// ---------------------------------------------------------------

// Mesmo conceito do Painel (lib/avaliacao-painel.ts): campanha = mesmo nome de
// ciclo replicado num CicloAvaliacao por CNPJ. O placar é da campanha inteira,
// porque "como está a avaliação do semestre" é uma pergunta do grupo.
export type CampanhaSelecionada = {
  nome: string;
  ciclos: CicloParaCobertura[];
  /** Menor início e maior fim entre os CNPJs — o "período" que a tela mostra. */
  dataInicio: Date;
  dataFim: Date;
  /** true só quando TODOS os ciclos da campanha foram encerrados. */
  encerrada: boolean;
};

/**
 * Escolhe a campanha que o placar acompanha: a mais recente que ainda tem
 * ciclo aberto; se tudo está encerrado, a mais recente mesmo assim (o placar
 * vira retrato final em vez de sumir).
 */
export function selecionarCampanhaAtual(ciclos: CicloParaCobertura[]): CampanhaSelecionada | null {
  if (ciclos.length === 0) return null;

  const porNome = new Map<string, CicloParaCobertura[]>();
  for (const c of ciclos) {
    const lista = porNome.get(c.nome) ?? [];
    lista.push(c);
    porNome.set(c.nome, lista);
  }

  const campanhas = [...porNome.entries()].map(([nome, doNome]) => ({
    nome,
    ciclos: doNome,
    dataInicio: new Date(Math.min(...doNome.map((c) => c.dataInicio.getTime()))),
    dataFim: new Date(Math.max(...doNome.map((c) => c.dataFim.getTime()))),
    encerrada: doNome.every((c) => c.encerrado),
  }));

  const abertas = campanhas.filter((c) => !c.encerrada);
  const candidatas = abertas.length > 0 ? abertas : campanhas;
  return candidatas.sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime())[0];
}

// ---------------------------------------------------------------
// Saída
// ---------------------------------------------------------------

export type LinhaPlacarEmpresa = {
  empresaId: string;
  empresaNome: string;
  ativos: number;
  /** Ativos distintos com pelo menos uma avaliação gerada — quem está NO processo. */
  colaboradoresNoProcesso: number;
  geradas: number;
  concluidas: number;
  concluidasPct: number;
  gestorGeradas: number;
  gestorConcluidas: number;
  /** Avaliações GESTOR com potencial marcado — o insumo que faltou ao nine-box. */
  potenciaisPreenchidos: number;
};

export type AvaliadorNaFila = {
  avaliadorId: string;
  /** Null = avaliador removido do cadastro; a tela mostra rótulo explícito. */
  avaliadorNome: string | null;
  pendentes: number;
  concluidas: number;
  /** Fatia deste avaliador na fila de equipe pendente (0–100). */
  pctDaFila: number;
};

export type GapPar = {
  colaboradorId: string;
  colaboradorNome: string;
  empresaId: string;
  empresaNome: string;
  notaAuto: number;
  notaGestor: number;
  /** auto − gestor: positivo = a pessoa se vê melhor do que o gestor a vê. */
  gap: number;
  avaliadorId: string;
  avaliadorNome: string | null;
};

export type GapPorLider = {
  avaliadorId: string;
  avaliadorNome: string | null;
  pares: number;
  gapMedio: number;
};

export type CoberturaCampanha = {
  campanha: string;
  dataInicio: Date;
  dataFim: Date;
  encerrada: boolean;
  duracaoDias: number;
  /** 0 quando o prazo já passou — a tela decide o texto. */
  diasRestantes: number;
  emAndamento: boolean;
  totais: {
    geradas: number;
    concluidas: number;
    pendentes: number;
    /** Fila do próprio colaborador — não é atraso de gestor. */
    pendentesAuto: number;
    /** Fila de quem avalia outra pessoa (GESTOR e, se existirem, PAR/SUBORDINADO). */
    pendentesEquipe: number;
    gestorGeradas: number;
    gestorConcluidas: number;
    potenciaisPreenchidos: number;
    colaboradoresNoProcesso: number;
    ativosNoGrupo: number;
  };
  porEmpresa: LinhaPlacarEmpresa[];
  /** Ciclo aberto na campanha, zero avaliações geradas — gente fora do processo. */
  semAvaliacaoGerada: { empresaId: string; empresaNome: string; ativos: number }[];
  ativosForaDoProcesso: number;
  /** Empresas visíveis que nem ciclo têm nesta campanha — ficam FORA do placar. */
  empresasSemCicloNaCampanha: { empresaId: string; empresaNome: string; ativos: number }[];
  filaEquipe: {
    total: number;
    avaliadores: AvaliadorNaFila[];
    /** Fatia dos 2 maiores na fila pendente — null com fila vazia. */
    concentracaoTop2Pct: number | null;
  };
  gap: {
    /** Médias de TODAS as concluídas com nota, sem parear — o retrato bruto. */
    concluidasAuto: number;
    mediaAutoTodas: number | null;
    concluidasGestor: number;
    mediaGestorTodas: number | null;
    /** Pares: mesma pessoa, mesmo ciclo, auto E gestor concluídas com nota. */
    pares: number;
    gapMedio: number | null;
    paresComGapAlto: number;
    lista: GapPar[];
    porLider: GapPorLider[];
    lideresForaDoPiso: number;
  };
  avisos: string[];
};

/**
 * Gap ≥ 1,5 ponto (escala 1–5) marca "expectativa desalinhada": é quase a
 * diferença média já observada entre auto (4,53) e gestor (2,88) na base —
 * quem passa disso está acima até do desalinhamento típico da casa.
 */
export const LIMIAR_GAP_ALTO = 1.5;

/**
 * Líder com menos de 3 pares concluídos fica fora do recorte por líder — com
 * 1 ou 2 pares o "gap médio do líder" é a nota de uma pessoa, não um padrão.
 * Mesmo piso que AMOSTRA_MINIMA_ANONIMATO usa nas pesquisas, aqui por motivo
 * estatístico (e para não apontar dedo com amostra de anedota).
 */
export const PISO_PARES_POR_LIDER = 3;

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

// ---------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------

export function calcularCoberturaCampanha(
  campanha: CampanhaSelecionada,
  avaliacoes: AvaliacaoParaCobertura[],
  empresas: EmpresaParaCobertura[],
  hoje: Date = hojeUTC(),
): CoberturaCampanha {
  const avisos: string[] = [];
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const empresaNomeDe = (id: string) => nomeEmpresa.get(id) ?? "—";

  // ---- Janela de tempo ----
  const duracaoDias = diferencaEmDiasUTC(campanha.dataFim, campanha.dataInicio) + 1;
  const diasRestantes = Math.max(0, diferencaEmDiasUTC(campanha.dataFim, hoje));
  const emAndamento = !campanha.encerrada && diferencaEmDiasUTC(campanha.dataFim, hoje) >= 0;

  // ---- Totais e placar por CNPJ ----
  const ehConcluida = (a: AvaliacaoParaCobertura) => a.status === "CONCLUIDA";
  const ehAuto = (a: AvaliacaoParaCobertura) => a.tipoAvaliador === "AUTOAVALIACAO";
  const ehGestor = (a: AvaliacaoParaCobertura) => a.tipoAvaliador === "GESTOR";

  const empresasComCiclo = new Set(campanha.ciclos.map((c) => c.empresaId));
  const porEmpresaMap = new Map<string, LinhaPlacarEmpresa & { noProcesso: Set<string> }>();
  for (const id of empresasComCiclo) {
    porEmpresaMap.set(id, {
      empresaId: id,
      empresaNome: empresaNomeDe(id),
      ativos: empresas.find((e) => e.id === id)?.ativos ?? 0,
      colaboradoresNoProcesso: 0,
      geradas: 0,
      concluidas: 0,
      concluidasPct: 0,
      gestorGeradas: 0,
      gestorConcluidas: 0,
      potenciaisPreenchidos: 0,
      noProcesso: new Set<string>(),
    });
  }

  const noProcessoGrupo = new Set<string>();
  for (const a of avaliacoes) {
    const linha = porEmpresaMap.get(a.empresaId);
    if (!linha) continue; // avaliação de ciclo fora da campanha não deveria chegar aqui
    linha.geradas += 1;
    linha.noProcesso.add(a.colaboradorId);
    noProcessoGrupo.add(a.colaboradorId);
    if (ehConcluida(a)) linha.concluidas += 1;
    if (ehGestor(a)) {
      linha.gestorGeradas += 1;
      if (ehConcluida(a)) linha.gestorConcluidas += 1;
      if (a.potencial !== null) linha.potenciaisPreenchidos += 1;
    }
  }

  const linhas = [...porEmpresaMap.values()].map(({ noProcesso, ...linha }) => ({
    ...linha,
    colaboradoresNoProcesso: noProcesso.size,
    concluidasPct: pct(linha.concluidas, linha.geradas),
  }));

  // Pior cobertura primeiro — é onde o RH precisa agir.
  const porEmpresa = linhas
    .filter((l) => l.geradas > 0)
    .sort((a, b) => a.concluidasPct - b.concluidasPct || b.geradas - a.geradas);

  const semAvaliacaoGerada = linhas
    .filter((l) => l.geradas === 0)
    .map((l) => ({ empresaId: l.empresaId, empresaNome: l.empresaNome, ativos: l.ativos }))
    .sort((a, b) => b.ativos - a.ativos);
  const ativosForaDoProcesso = semAvaliacaoGerada.reduce((s, e) => s + e.ativos, 0);

  const empresasSemCicloNaCampanha = empresas
    .filter((e) => !empresasComCiclo.has(e.id))
    .map((e) => ({ empresaId: e.id, empresaNome: e.nome, ativos: e.ativos }))
    .sort((a, b) => b.ativos - a.ativos);
  if (empresasSemCicloNaCampanha.length > 0) {
    const nomes = empresasSemCicloNaCampanha.map((e) => e.empresaNome).join(", ");
    const soma = empresasSemCicloNaCampanha.reduce((s, e) => s + e.ativos, 0);
    avisos.push(
      `Fora do placar: ${nomes} (${soma} ativo(s)) — sem ciclo criado nesta campanha.`,
    );
  }

  const pendentesLista = avaliacoes.filter((a) => !ehConcluida(a));
  const pendentesAuto = pendentesLista.filter(ehAuto).length;

  // ---- Fila por avaliador ----
  // Tudo que NÃO é autoavaliação é trabalho de um avaliador sobre outra pessoa
  // (hoje só existe GESTOR; PAR/SUBORDINADO, se criados, caem na mesma fila).
  // Mesma régua do lembrete de pendências em lib/actions/rh-avaliacao.ts.
  const filaPendente = pendentesLista.filter((a) => !ehAuto(a));
  const filaMap = new Map<string, AvaliadorNaFila>();
  for (const a of avaliacoes) {
    if (ehAuto(a)) continue;
    const atual =
      filaMap.get(a.avaliadorId) ??
      ({ avaliadorId: a.avaliadorId, avaliadorNome: a.avaliadorNome, pendentes: 0, concluidas: 0, pctDaFila: 0 } as AvaliadorNaFila);
    if (ehConcluida(a)) atual.concluidas += 1;
    else atual.pendentes += 1;
    if (atual.avaliadorNome === null && a.avaliadorNome !== null) atual.avaliadorNome = a.avaliadorNome;
    filaMap.set(a.avaliadorId, atual);
  }
  const avaliadores = [...filaMap.values()]
    .map((f) => ({ ...f, pctDaFila: pct(f.pendentes, filaPendente.length) }))
    .filter((f) => f.pendentes > 0)
    .sort((a, b) => b.pendentes - a.pendentes || b.concluidas - a.concluidas);

  const concentracaoTop2Pct =
    filaPendente.length > 0
      ? pct(avaliadores.slice(0, 2).reduce((s, f) => s + f.pendentes, 0), filaPendente.length)
      : null;

  if (avaliadores.some((f) => f.avaliadorNome === null)) {
    avisos.push(
      "Há avaliações pendentes atribuídas a avaliador removido do cadastro — reatribua no detalhe do ciclo.",
    );
  }

  // ---- Gap autoavaliação × gestor ----
  const autosConcluidas = avaliacoes.filter((a) => ehAuto(a) && ehConcluida(a) && a.notaFinal !== null);
  const gestoresConcluidas = avaliacoes.filter((a) => ehGestor(a) && ehConcluida(a) && a.notaFinal !== null);
  const media = (lista: AvaliacaoParaCobertura[]) =>
    lista.length > 0 ? lista.reduce((s, a) => s + (a.notaFinal as number), 0) / lista.length : null;

  // Par = mesma pessoa, mesmo ciclo, os DOIS lados concluídos com nota. Se a
  // mesma pessoa tiver dois GESTOR no ciclo (possível pelo @@unique por
  // avaliador), cada gestor forma o próprio par — o gap mede o feedback
  // DAQUELE avaliador, não uma média que não é de ninguém.
  const autoPorChave = new Map<string, AvaliacaoParaCobertura>();
  for (const a of autosConcluidas) autoPorChave.set(`${a.colaboradorId}:${a.cicloId}`, a);

  const lista: GapPar[] = [];
  for (const g of gestoresConcluidas) {
    const auto = autoPorChave.get(`${g.colaboradorId}:${g.cicloId}`);
    if (!auto) continue;
    lista.push({
      colaboradorId: g.colaboradorId,
      colaboradorNome: g.colaboradorNome,
      empresaId: g.empresaId,
      empresaNome: empresaNomeDe(g.empresaId),
      notaAuto: auto.notaFinal as number,
      notaGestor: g.notaFinal as number,
      gap: (auto.notaFinal as number) - (g.notaFinal as number),
      avaliadorId: g.avaliadorId,
      avaliadorNome: g.avaliadorNome,
    });
  }
  lista.sort((a, b) => b.gap - a.gap);

  const gapMedio = lista.length > 0 ? lista.reduce((s, p) => s + p.gap, 0) / lista.length : null;

  const paresPorLider = new Map<string, { avaliadorNome: string | null; gaps: number[] }>();
  for (const p of lista) {
    const atual = paresPorLider.get(p.avaliadorId) ?? { avaliadorNome: p.avaliadorNome, gaps: [] };
    atual.gaps.push(p.gap);
    paresPorLider.set(p.avaliadorId, atual);
  }
  const porLider: GapPorLider[] = [...paresPorLider.entries()]
    .filter(([, v]) => v.gaps.length >= PISO_PARES_POR_LIDER)
    .map(([avaliadorId, v]) => ({
      avaliadorId,
      avaliadorNome: v.avaliadorNome,
      pares: v.gaps.length,
      gapMedio: v.gaps.reduce((s, g) => s + g, 0) / v.gaps.length,
    }))
    .sort((a, b) => b.gapMedio - a.gapMedio);
  const lideresForaDoPiso = [...paresPorLider.values()].filter(
    (v) => v.gaps.length < PISO_PARES_POR_LIDER,
  ).length;

  if (lista.length === 0) {
    avisos.push(
      "Gap auto × gestor ainda sem pares: precisa da autoavaliação E da avaliação de gestor da MESMA pessoa concluídas. Não afirme alinhamento — é ausência de dado, não gap zero.",
    );
  } else if (lista.length < PISO_PARES_POR_LIDER) {
    avisos.push(
      `Só ${lista.length} par(es) concluído(s) — o gap médio ainda é anedota, não tendência.`,
    );
  }
  if (lideresForaDoPiso > 0) {
    avisos.push(
      `${lideresForaDoPiso} líder(es) com menos de ${PISO_PARES_POR_LIDER} pares concluídos ficam fora do recorte por líder (piso de amostra).`,
    );
  }

  return {
    campanha: campanha.nome,
    dataInicio: campanha.dataInicio,
    dataFim: campanha.dataFim,
    encerrada: campanha.encerrada,
    duracaoDias,
    diasRestantes,
    emAndamento,
    totais: {
      geradas: avaliacoes.length,
      concluidas: avaliacoes.filter(ehConcluida).length,
      pendentes: pendentesLista.length,
      pendentesAuto,
      pendentesEquipe: filaPendente.length,
      gestorGeradas: avaliacoes.filter(ehGestor).length,
      gestorConcluidas: gestoresConcluidas.length,
      potenciaisPreenchidos: avaliacoes.filter((a) => ehGestor(a) && a.potencial !== null).length,
      colaboradoresNoProcesso: noProcessoGrupo.size,
      ativosNoGrupo: empresas.reduce((s, e) => s + e.ativos, 0),
    },
    porEmpresa,
    semAvaliacaoGerada,
    ativosForaDoProcesso,
    empresasSemCicloNaCampanha,
    filaEquipe: { total: filaPendente.length, avaliadores, concentracaoTop2Pct },
    gap: {
      concluidasAuto: autosConcluidas.length,
      mediaAutoTodas: media(autosConcluidas),
      concluidasGestor: gestoresConcluidas.length,
      mediaGestorTodas: media(gestoresConcluidas),
      pares: lista.length,
      gapMedio,
      paresComGapAlto: lista.filter((p) => p.gap >= LIMIAR_GAP_ALTO).length,
      lista,
      porLider,
      lideresForaDoPiso,
    },
    avisos,
  };
}
