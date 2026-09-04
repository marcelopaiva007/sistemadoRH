/**
 * Leitor ÚNICO da jornada: as marcações que contam para o dia de um colaborador.
 *
 * Duas fontes, uma lista:
 * - RegistroPonto — o que o REP-P coletou (batida com NSR, hash, IP, GPS, foto).
 *   É a ÚNICA fonte do AFD (Portaria MTP 671/2021).
 * - MarcacaoTratada — a marcação que nasce de uma decisão do RH sobre um
 *   tratamento de ponto (INCLUSAO_MANUAL aprovada). Não consome NSR, nunca vai
 *   para o AFD; vai para o AEJ, para o painel de presença e para a apuração.
 *
 * POR QUE EXISTE. Até v1.165.0 aprovar uma inclusão manual só mudava o status
 * do TratamentoPonto: nada virava marcação. O monitor de presença, o AEJ e o
 * portal (jaBateuHoje) só liam RegistroPonto — quem teve a ENTRADA_1 incluída
 * pelo RH continuava "sem entrada" e podia bater ENTRADA_1 de novo. Todo
 * consumidor que precisa da JORNADA (e não do AFD) lê daqui, e só daqui, para
 * que as duas tabelas nunca voltem a divergir tela a tela.
 *
 * O que NÃO faz: não grava, não decide, não gera hash. Só lê e mescla.
 */

import type { Cliente } from "@/lib/prisma";
import { dataHoraDoFormularioBrasilia, paraInputDate } from "@/lib/datas";
import type { BatidaPonto } from "@/lib/ponto-regras";

export type TipoMarcacao = "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";

export const TIPOS_MARCACAO: readonly TipoMarcacao[] = [
  "ENTRADA_1",
  "SAIDA_1",
  "ENTRADA_2",
  "SAIDA_2",
] as const;

export function ehTipoMarcacao(valor: unknown): valor is TipoMarcacao {
  return typeof valor === "string" && (TIPOS_MARCACAO as readonly string[]).includes(valor);
}

export type MarcacaoDeJornada = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  /** Instante UTC — mesma convenção de RegistroPonto.dataHora e MarcacaoTratada.dataHora. */
  dataHora: Date;
  tipo: string;
  origem: "BATIDA" | "TRATAMENTO";
  /** NSR da batida; null para marcação tratada (não consome NSR). */
  nsr: bigint | null;
  hashSHA256: string;
  fotoUrl: string | null;
  /** Id do TratamentoPonto que gerou a marcação; null para batida. */
  tratamentoId: string | null;
  /** Cópia do motivo do tratamento no instante da decisão; null para batida. */
  justificativa: string | null;
};

/**
 * Instante UTC de uma marcação tratada a partir do que o tratamento guarda.
 *
 * RECEITA (não trocar por diaBrasilia):
 * - `dataFato` é gravada como MEIA-NOITE UTC (data de calendário, sem hora).
 *   diaBrasilia(dataFato) leria 2026-09-03T00:00Z como 02/09 às 21:00 de
 *   Brasília e devolveria o dia ERRADO. O dia vem de paraInputDate(), que lê
 *   em UTC — o mesmo caminho que o formulário usa para preencher o input.
 * - `horaSolicitada` é "HH:mm" declarado pela pessoa, em horário de Brasília.
 * - A junção é dataHoraDoFormularioBrasilia(`${dia}T${hora}`), que fixa o
 *   offset -03:00 (Brasil sem horário de verão desde 2019).
 *
 * Exemplos: 2026-09-03T00:00Z + "18:00" -> 2026-09-03T21:00:00Z;
 *           2026-09-03T00:00Z + "23:30" -> 2026-09-04T02:30:00Z;
 *           2026-09-03T00:00Z + "00:30" -> 2026-09-03T03:30:00Z.
 *
 * Lança erro (em vez de devolver null) porque quem chama já validou a hora no
 * servidor; chegar aqui com hora inválida é bug, não entrada do usuário.
 */
export function instanteDaMarcacaoTratada(dataFato: Date, horaSolicitada: string): Date {
  const hora = (horaSolicitada ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    throw new Error(`Hora solicitada inválida para marcação tratada: "${horaSolicitada}" (esperado HH:mm).`);
  }
  const dia = paraInputDate(dataFato);
  if (!dia) {
    throw new Error("Data do fato ausente para marcação tratada.");
  }
  const instante = dataHoraDoFormularioBrasilia(`${dia}T${hora}`);
  if (!instante) {
    throw new Error(`Não foi possível montar o instante da marcação tratada a partir de ${dia}T${hora}.`);
  }
  return instante;
}

/**
 * União de RegistroPonto (origem BATIDA) e MarcacaoTratada (origem TRATAMENTO)
 * no intervalo [de, ate), ordenada por dataHora crescente.
 *
 * Duas consultas — uma por tabela, disparadas em paralelo — e a mescla em
 * memória. Sem $queryRaw: as duas tabelas têm índice (empresaId, dataHora) e
 * (colaboradorId, dataHora), o filtro é o mesmo nas duas, e o volume de um
 * intervalo (um dia para o monitor, um mês para o AEJ) cabe folgado em memória.
 *
 * Empate de instante: BATIDA antes de TRATAMENTO (o que a máquina mediu
 * precede o que foi incluído por decisão), depois id — ordem estável para a
 * mesma consulta rodada duas vezes.
 */
export async function marcacoesDaJornada(
  db: Cliente,
  filtro: { empresaId: string; colaboradorId?: string; de: Date; ate: Date },
): Promise<MarcacaoDeJornada[]> {
  const where = {
    empresaId: filtro.empresaId,
    ...(filtro.colaboradorId ? { colaboradorId: filtro.colaboradorId } : {}),
    dataHora: { gte: filtro.de, lt: filtro.ate },
  };

  const [batidas, tratadas] = await Promise.all([
    db.registroPonto.findMany({
      where,
      select: {
        id: true,
        empresaId: true,
        colaboradorId: true,
        dataHora: true,
        tipo: true,
        nsr: true,
        hashSHA256: true,
        fotoUrl: true,
      },
    }),
    db.marcacaoTratada.findMany({
      where,
      select: {
        id: true,
        empresaId: true,
        colaboradorId: true,
        dataHora: true,
        tipo: true,
        hashSHA256: true,
        tratamentoId: true,
        justificativa: true,
      },
    }),
  ]);

  const uniao: MarcacaoDeJornada[] = [
    ...batidas.map((b) => ({
      id: b.id,
      empresaId: b.empresaId,
      colaboradorId: b.colaboradorId,
      dataHora: b.dataHora,
      tipo: b.tipo,
      origem: "BATIDA" as const,
      nsr: b.nsr,
      hashSHA256: b.hashSHA256,
      fotoUrl: b.fotoUrl ?? null,
      tratamentoId: null,
      justificativa: null,
    })),
    ...tratadas.map((t) => ({
      id: t.id,
      empresaId: t.empresaId,
      colaboradorId: t.colaboradorId,
      dataHora: t.dataHora,
      tipo: t.tipo,
      origem: "TRATAMENTO" as const,
      nsr: null,
      hashSHA256: t.hashSHA256,
      fotoUrl: null,
      tratamentoId: t.tratamentoId,
      justificativa: t.justificativa,
    })),
  ];

  uniao.sort((a, b) => {
    const dt = a.dataHora.getTime() - b.dataHora.getTime();
    if (dt !== 0) return dt;
    if (a.origem !== b.origem) return a.origem === "BATIDA" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return uniao;
}

/**
 * Projeção para o motor de regras (lib/ponto-regras.ts): jaBateuHoje e a
 * apuração recebem BatidaPonto[] e não precisam saber de onde a marcação veio.
 * Marcações com tipo fora dos quatro conhecidos são descartadas — não há
 * jornada possível com elas.
 */
export function comoBatidasPonto(marcacoes: MarcacaoDeJornada[]): BatidaPonto[] {
  const saida: BatidaPonto[] = [];
  for (const m of marcacoes) {
    if (ehTipoMarcacao(m.tipo)) saida.push({ tipo: m.tipo, dataHora: m.dataHora });
  }
  return saida;
}
