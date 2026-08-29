import { diaBrasilia } from "@/lib/datas";

// PAINEL DE ENTREGAS — a conta de quem entrega e quem não entrega, por pessoa,
// sobre as demandas de UM solicitante. Pedido da Direção em 29/08/2026: "saber
// se o pessoal tá entregando minhas demandas dentro da janela de tempo e qual
// o tempo médio de cada tarefa".
//
// Módulo PURO (sem banco, sem sessão), como lib/delegacoes/estados.ts: recebe
// as demandas já recortadas pelo servidor e devolve as linhas prontas — é o
// que scripts/test-delegacoes-painel.ts prova.
//
// HONESTIDADE DO NÚMERO (mesma regra do "comentário da diretoria honesto"):
// o sistema NÃO tem apontamento de horas. O que existe é o relógio da demanda:
// aceite → entrega. Por isso o painel fala em "tempo até entregar" — tempo
// CORRIDO com a demanda na mão da pessoa — e nunca em "horas trabalhadas",
// que seria um número inventado.

/** O retrato mínimo de uma demanda para a conta do painel. */
export type DemandaParaPainel = {
  status: string;
  prazo: Date;
  enviadaEm: Date | null;
  aceiteEm: Date | null;
  responsavelNome: string;
  /** Quantas vezes o prazo foi repactuado. */
  repactuacoes: number;
  /** Toda tentativa de entrega, devolvidas incluídas. */
  entregas: { createdAt: Date; aceita: boolean | null }[];
};

export type LinhaPainel = {
  nome: string;
  /** ENVIADA / ACEITA / EM_EXECUCAO — a demanda ainda está com a pessoa. */
  abertas: number;
  /** Dentre as abertas, quantas já passaram do prazo. */
  atrasadas: number;
  /** ENTREGUE (aguardando aceite do solicitante) ou ENCERRADA. */
  entregues: number;
  /** Dentre as entregues, quantas chegaram até o dia do prazo vigente. */
  noPrazo: number;
  /** Entregas que o solicitante devolveu (retrabalho). */
  devolucoes: number;
  /** Demandas em que a pessoa pediu mais prazo ao menos uma vez. */
  repactuadas: number;
  /** Tempo médio aceite→entrega, em horas. Nulo sem entrega medível. */
  horasMediaEntrega: number | null;
  /** Soma dos tempos aceite→entrega das entregues, em horas. */
  horasSomadas: number;
};

export type Painel = {
  linhas: LinhaPainel[];
  totais: LinhaPainel;
};

const ABERTAS = ["ENVIADA", "ACEITA", "EM_EXECUCAO"];
const ENTREGARAM = ["ENTREGUE", "ENCERRADA"];

/**
 * A entrega QUE VALE de uma demanda: a aceita, se houver; senão a última — na
 * ENTREGUE é a que está aguardando o solicitante. As devolvidas anteriores
 * continuam contando em `devolucoes`, mas não são o momento da entrega.
 */
function entregaQueVale(d: DemandaParaPainel): { createdAt: Date } | null {
  if (d.entregas.length === 0) return null;
  return d.entregas.find((e) => e.aceita === true) ?? d.entregas[d.entregas.length - 1];
}

/**
 * "No prazo" compara DIAS DE CALENDÁRIO DE BRASÍLIA, não instantes: o prazo
 * vale até o fim do dia (é o que a tela de criação promete — "vale até o fim
 * do dia"), então entregar 22h de sexta com prazo sexta É no prazo. A régua é
 * o prazo VIGENTE: quem repactuou e cumpriu o combinado novo conta como no
 * prazo — a coluna de repactuações é que denuncia o escorregão.
 */
function entregouNoPrazo(entrega: Date, prazo: Date): boolean {
  return diaBrasilia(entrega) <= diaBrasilia(prazo);
}

/** Horas entre o aceite (ou o envio, se o aceite faltar) e a entrega. */
function horasAteEntregar(d: DemandaParaPainel, entrega: Date): number | null {
  const inicio = d.aceiteEm ?? d.enviadaEm;
  if (!inicio) return null;
  const horas = (entrega.getTime() - inicio.getTime()) / 3_600_000;
  return horas < 0 ? null : horas;
}

function linhaVazia(nome: string): LinhaPainel {
  return {
    nome,
    abertas: 0,
    atrasadas: 0,
    entregues: 0,
    noPrazo: 0,
    devolucoes: 0,
    repactuadas: 0,
    horasMediaEntrega: null,
    horasSomadas: 0,
  };
}

/**
 * A conta inteira: agrega por responsável e devolve as linhas mais os totais.
 * RASCUNHO e CANCELADA ficam de fora — rascunho ainda não foi delegado, e
 * cancelada não mede ninguém (quem a matou foi o solicitante).
 */
export function montarPainelEntregas(demandas: DemandaParaPainel[], agora = new Date()): Painel {
  const hoje = diaBrasilia(agora);
  const porPessoa = new Map<string, LinhaPainel & { medicoes: number[] }>();

  for (const d of demandas) {
    if (!ABERTAS.includes(d.status) && !ENTREGARAM.includes(d.status)) continue;

    let linha = porPessoa.get(d.responsavelNome);
    if (!linha) {
      linha = { ...linhaVazia(d.responsavelNome), medicoes: [] };
      porPessoa.set(d.responsavelNome, linha);
    }

    linha.devolucoes += d.entregas.filter((e) => e.aceita === false).length;
    if (d.repactuacoes > 0) linha.repactuadas++;

    if (ABERTAS.includes(d.status)) {
      linha.abertas++;
      if (diaBrasilia(d.prazo) < hoje) linha.atrasadas++;
      continue;
    }

    linha.entregues++;
    const entrega = entregaQueVale(d);
    if (!entrega) continue;
    if (entregouNoPrazo(entrega.createdAt, d.prazo)) linha.noPrazo++;
    const horas = horasAteEntregar(d, entrega.createdAt);
    if (horas !== null) {
      linha.medicoes.push(horas);
      linha.horasSomadas += horas;
    }
  }

  const agregadas = [...porPessoa.values()].sort(
    // Quem carrega mais demanda vem primeiro; empate resolve por nome.
    (a, b) =>
      b.abertas + b.entregues - (a.abertas + a.entregues) ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const linhas = agregadas.map(({ medicoes, ...linha }) => ({
    ...linha,
    horasMediaEntrega:
      medicoes.length > 0 ? medicoes.reduce((a, b) => a + b, 0) / medicoes.length : null,
  }));

  const totais = linhas.reduce((t, l) => {
    t.abertas += l.abertas;
    t.atrasadas += l.atrasadas;
    t.entregues += l.entregues;
    t.noPrazo += l.noPrazo;
    t.devolucoes += l.devolucoes;
    t.repactuadas += l.repactuadas;
    t.horasSomadas += l.horasSomadas;
    return t;
  }, linhaVazia("Todos"));
  // A média geral pondera pelo nº de MEDIÇÕES, não pela média de cada pessoa —
  // média de médias daria peso igual a quem entregou 1 e a quem entregou 20.
  const totalMedicoes = agregadas.reduce((s, l) => s + l.medicoes.length, 0);
  totais.horasMediaEntrega = totalMedicoes > 0 ? totais.horasSomadas / totalMedicoes : null;

  return { linhas, totais };
}

/**
 * Duração legível: "—" sem medida, "menos de 1h", "18h", "3d 4h". Dias de 24h
 * corridos — é tempo de calendário com a demanda na mão, não jornada.
 */
export function duracaoEmTexto(horas: number | null): string {
  if (horas === null) return "—";
  if (horas < 1) return "menos de 1h";
  const inteiras = Math.round(horas);
  if (inteiras < 48) return `${inteiras}h`;
  const dias = Math.floor(inteiras / 24);
  const resto = inteiras % 24;
  return resto > 0 ? `${dias}d ${resto}h` : `${dias}d`;
}

/** "4 de 5 (80%)" — a fração sempre junto do percentual, para ninguém ler 100% de 1. */
export function fracaoEmTexto(parte: number, total: number): string {
  if (total === 0) return "—";
  return `${parte} de ${total} (${Math.round((parte / total) * 100)}%)`;
}
