// Prazos legais dos eventos de pessoal que o escritório contábil transmite ao
// eSocial — regra pura, sem banco, testada em scripts/test-prazos-legais.ts.
//
// POR QUE ISTO EXISTE (26/11/2026). O sistema não gera evento do eSocial
// nenhum: quem transmite é o escritório contábil de cada empresa. Mas o PRAZO
// é da empresa — S-2200 fora do prazo é auto de infração, rescisão paga depois
// do 10º dia é multa do art. 477 §8º, CAT atrasada é multa do art. 22 da Lei
// 8.213/91 — e o escritório só transmite o que recebe. A decisão desta fase
// foi NÃO transmitir nem montar XML assinado: o sistema diz QUANDO cada evento
// vence, exporta os dados para o escritório e o RH marca "enviado ao
// escritório" (EventoEsocialEnvio). A pendência some quando é marcada.
//
// DIAS ÚTEIS. O sistema não tem tabela de feriados: "dia útil" aqui é segunda
// a sexta. Num feriado, o prazo calculado fica UM dia antes do real em alguns
// casos e igual nos demais — nunca depois. A tela diz isso ao RH.
//
// Datas são de calendário (meia-noite UTC, como em lib/datas.ts). Quem chama
// converte instantes para o dia de Brasília antes (dataBrasilia).

import { dataUTC, diferencaEmDiasUTC, inicioDoDiaUTC, somarDiasUTC } from "./datas";

export const TIPOS_EVENTO_ESOCIAL = [
  { value: "S2200", codigo: "S-2200", label: "Admissão" },
  { value: "S2299", codigo: "S-2299", label: "Desligamento" },
  { value: "S2210", codigo: "S-2210", label: "Acidente de trabalho (CAT)" },
  { value: "S2230", codigo: "S-2230", label: "Afastamento" },
] as const;

export type TipoEventoEsocial = (typeof TIPOS_EVENTO_ESOCIAL)[number]["value"];

export function ehTipoEventoEsocial(v: string): v is TipoEventoEsocial {
  return TIPOS_EVENTO_ESOCIAL.some((t) => t.value === v);
}

export function rotuloEventoEsocial(tipo: TipoEventoEsocial): string {
  const t = TIPOS_EVENTO_ESOCIAL.find((x) => x.value === tipo)!;
  return `${t.codigo} · ${t.label}`;
}

/**
 * A partir de quando o sistema cobra os prazos (data do fato: admissão,
 * desligamento, acidente, início do afastamento).
 *
 * Decisão de 26/11/2026, a confirmar com o CEO: o mês da competência em que a
 * função entrou no ar. Fato anterior a isso o escritório já tratou fora do
 * sistema — cobrá-lo encheria a tela de "enviar ao escritório" com o que já
 * foi transmitido há meses, e a lista viraria ruído (o mesmo motivo do corte
 * PRIMEIRO_DESLIGAMENTO_COBRADO, em lib/constants-dp.ts). Novembro inteiro
 * entra porque ainda há prazo correndo nele (afastamento longo, rescisão do
 * fim do mês); o que dele já foi ao escritório o RH marca uma vez.
 */
export const ESOCIAL_PRAZOS_DESDE = dataUTC(2026, 11, 1);

/**
 * Contratos que NÃO são S-2200/S-2299. Estágio é trabalhador sem vínculo
 * (S-2300/S-2399, outros prazos); PJ não é evento de pessoal do eSocial.
 * Contrato sem tipo preenchido ENTRA — na dúvida, cobra-se.
 */
const CONTRATOS_FORA_DOS_EVENTOS_DE_EMPREGADO = ["PJ", "ESTAGIO"];

export function contratoGeraEventoDeEmpregado(tipoContrato: string | null | undefined): boolean {
  return !tipoContrato || !CONTRATOS_FORA_DOS_EVENTOS_DE_EMPREGADO.includes(tipoContrato);
}

// ------------------------------------------------------------------
// Dias úteis (segunda a sexta, sem feriados — ver o cabeçalho)
// ------------------------------------------------------------------

export function ehDiaUtil(d: Date): boolean {
  const dia = inicioDoDiaUTC(d).getUTCDay();
  return dia !== 0 && dia !== 6;
}

/** O primeiro dia útil DEPOIS de `d` (nunca o próprio `d`). */
export function proximoDiaUtil(d: Date): Date {
  let x = somarDiasUTC(d, 1);
  while (!ehDiaUtil(x)) x = somarDiasUTC(x, 1);
  return x;
}

/** `d`, se for dia útil; senão o último dia útil antes dele. */
export function diaUtilAteh(d: Date): Date {
  let x = inicioDoDiaUTC(d);
  while (!ehDiaUtil(x)) x = somarDiasUTC(x, -1);
  return x;
}

// ------------------------------------------------------------------
// Os prazos, evento a evento
// ------------------------------------------------------------------

export type Prazo = {
  /** Último dia para o escritório transmitir (e, no S-2299, para pagar). */
  prazo: Date;
  /** A regra em uma frase, para a tela e para o CSV. */
  regra: string;
};

/**
 * S-2200 — admissão. Até o dia ANTERIOR ao início do trabalho (MOS do
 * eSocial; a transmissão funciona todo dia, então não há ajuste de fim de
 * semana: o prazo é o dia de calendário).
 */
export function prazoAdmissao(dataAdmissao: Date): Prazo {
  return {
    prazo: somarDiasUTC(dataAdmissao, -1),
    regra: "Até o dia anterior ao início do trabalho",
  };
}

/**
 * S-2299 — desligamento, e o pagamento da rescisão junto.
 *
 * CLT art. 477 §6º: pagamento e entrega dos documentos "até dez dias contados
 * a partir do término do contrato". Contagem do art. 132 do Código Civil (OJ
 * 162 da SDI-1 do TST): exclui o dia do término e inclui o do vencimento — o
 * 10º dia é término + 10. O S-2299 tem o mesmo prazo (10º dia seguinte ao
 * desligamento).
 *
 * DÚVIDA REGISTRADA: quando o 10º dia cai em sábado ou domingo, há quem
 * prorrogue para o dia útil seguinte e quem antecipe. Pagamento depende de
 * banco aberto, e multa do §8º é o risco — o sistema ANTECIPA para a sexta
 * anterior, que é a leitura que nunca atrasa.
 *
 * "Término" é a data de saída gravada na ficha (`dataDesligamento`). Com
 * aviso prévio indenizado, o término para este prazo é o último dia
 * trabalhado (Lei 13.467/2017 unificou a contagem) — é o que se espera que o
 * RH grave ali.
 */
export function prazoRescisao(dataDesligamento: Date): Prazo {
  const decimoDia = somarDiasUTC(dataDesligamento, 10);
  const prazo = diaUtilAteh(decimoDia);
  return {
    prazo,
    regra:
      prazo.getTime() === decimoDia.getTime()
        ? "10 dias corridos do término (CLT art. 477 §6º)"
        : "10 dias corridos do término (CLT art. 477 §6º), antecipado do fim de semana",
  };
}

/**
 * S-2299 de TRANSFERÊNCIA para outro CNPJ do grupo (26/11/2026). O evento
 * existe (motivo "transferência para empresa do mesmo grupo", e o S-2200 no
 * CNPJ de destino), mas NÃO há rescisão: o contrato continua, só muda o
 * empregador dentro do grupo, e não há verbas rescisórias a pagar. O prazo de
 * envio é o mesmo do S-2299 (10º dia seguinte ao desligamento, com a mesma
 * antecipação do fim de semana de `prazoRescisao`); o que muda é o texto, que
 * não pode falar em pagamento nem citar o art. 477.
 */
export function prazoTransferenciaGrupo(dataDesligamento: Date): Prazo {
  const { prazo } = prazoRescisao(dataDesligamento);
  const decimoDia = somarDiasUTC(dataDesligamento, 10);
  return {
    prazo,
    regra:
      prazo.getTime() === decimoDia.getTime()
        ? "Até o 10º dia seguinte à saída — transferência no grupo, sem pagamento de rescisão"
        : "Até o 10º dia seguinte à saída, antecipado do fim de semana — transferência no grupo, sem pagamento de rescisão",
  };
}

/**
 * S-2210 — CAT. Lei 8.213/91, art. 22: até o 1º dia útil seguinte ao da
 * ocorrência; em caso de morte, de imediato (o próprio dia).
 *
 * `diaAcidente` já é o dia em Brasília (ver dataBrasilia). Óbito o sistema não
 * tem campo próprio: quem chama infere pelo desligamento por FALECIMENTO.
 */
export function prazoCat(diaAcidente: Date, obito: boolean): Prazo {
  if (obito) return { prazo: inicioDoDiaUTC(diaAcidente), regra: "Óbito: comunicação imediata" };
  return { prazo: proximoDiaUtil(diaAcidente), regra: "1º dia útil seguinte ao acidente (Lei 8.213/91, art. 22)" };
}

/** Os tipos de ausência (lib/constants-dp.ts) que podem virar S-2230. */
export type AfastamentoParaEsocial = {
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  /** Ausência ligada a um AcidenteTrabalho registrado (o afastamento dele). */
  ligadoAAcidente: boolean;
};

/** Dia 15 do mês seguinte ao de `d`. */
function dia15DoMesSeguinte(d: Date): Date {
  return dataUTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 15);
}

/**
 * S-2230 — afastamento temporário. Devolve `null` quando o afastamento não é
 * evento a informar.
 *
 * Regras (MOS do eSocial, evento S-2230):
 *   - doença ou acidente com duração SUPERIOR a 15 dias: até o 16º dia do
 *     afastamento (o dia em que o INSS assume);
 *   - acidente/doença do TRABALHO de até 15 dias: até o dia 15 do mês
 *     seguinte;
 *   - licença-maternidade ("demais afastamentos"): até o dia 15 do mês
 *     seguinte ao início.
 *
 * DÚVIDAS REGISTRADAS, e a escolha conservadora em cada uma:
 *   - Acidente de trabalho com afastamento CURTO. O pedido falava em "acima de
 *     3 dias", e não há certeza aqui sobre o piso exato da regra vigente — o
 *     sistema cobra o S-2230 de TODO afastamento por acidente de trabalho,
 *     qualquer duração. Cobrar um evento que o escritório dispense custa um
 *     clique; deixar de cobrar um obrigatório custa multa.
 *   - Doença de até 15 dias NÃO entra. A exceção conhecida — novo afastamento
 *     pela MESMA doença dentro de 60 dias, que soma os períodos (Decreto
 *     3.048/99, art. 75) — exige comparar CID entre atestados, que o sistema
 *     não faz ainda. Fica para o escritório, que recebe os atestados.
 *   - AFASTAMENTO_INSS de até 15 dias: costuma ser só o trecho pago pelo INSS,
 *     que começa no 16º dia — o prazo vira o próprio início.
 */
export function prazoAfastamento(a: AfastamentoParaEsocial): Prazo | null {
  const duracao = Math.max(a.dias, diferencaEmDiasUTC(a.dataFim, a.dataInicio) + 1);
  const dia16 = somarDiasUTC(a.dataInicio, 15);
  const acidente = a.tipo === "ACIDENTE_TRABALHO" || a.ligadoAAcidente;

  if (acidente) {
    return duracao > 15
      ? { prazo: dia16, regra: "Acidente de trabalho acima de 15 dias: até o 16º dia" }
      : {
          prazo: dia15DoMesSeguinte(a.dataInicio),
          regra: "Acidente de trabalho até 15 dias: até o dia 15 do mês seguinte",
        };
  }
  if (a.tipo === "AFASTAMENTO_INSS") {
    return duracao > 15
      ? { prazo: dia16, regra: "Afastamento acima de 15 dias: até o 16º dia" }
      : { prazo: inicioDoDiaUTC(a.dataInicio), regra: "Afastamento pelo INSS: até o início do trecho do INSS" };
  }
  if (a.tipo === "ATESTADO") {
    return duracao > 15 ? { prazo: dia16, regra: "Doença acima de 15 dias: até o 16º dia" } : null;
  }
  if (a.tipo === "LICENCA_MATERNIDADE") {
    return { prazo: dia15DoMesSeguinte(a.dataInicio), regra: "Licença-maternidade: até o dia 15 do mês seguinte" };
  }
  return null;
}

/** Os tipos de ausência que `prazoAfastamento` pode transformar em evento. */
export const TIPOS_AUSENCIA_DO_S2230 = [
  "ATESTADO",
  "AFASTAMENTO_INSS",
  "ACIDENTE_TRABALHO",
  "LICENCA_MATERNIDADE",
] as const;

// ------------------------------------------------------------------
// Aviso prévio proporcional
// ------------------------------------------------------------------

/**
 * Lei 12.506/2011: 30 dias + 3 por ano COMPLETO de serviço, até 90. Pela Nota
 * Técnica 184/2012 do MTE, o primeiro acréscimo vem com 1 ano completo (33
 * dias) — e 20 anos já chegam ao teto.
 */
export function avisoPrevioProporcional(anosCompletos: number): number {
  const anos = Math.max(0, Math.floor(anosCompletos));
  return Math.min(90, 30 + 3 * anos);
}

export type AvisoDevido = {
  /** Dias de aviso; `null` quando o motivo não tem aviso prévio. */
  dias: number | null;
  texto: string;
};

/**
 * O aviso devido pelo MOTIVO da saída (MOTIVOS_DESLIGAMENTO em
 * lib/constants-dp.ts):
 *   - dispensa sem justa causa: o proporcional, a favor do empregado;
 *   - acordo (art. 484-A, I, "a"): metade do aviso, se indenizado;
 *   - pedido de demissão: 30 dias, devidos PELO empregado — a
 *     proporcionalidade é só a favor dele (entendimento do TST);
 *   - os demais (justa causa, fim de contrato, falecimento, abandono,
 *     transferência no grupo, aposentadoria): sem aviso.
 */
export function avisoPrevioDevido(motivo: string | null | undefined, anosCompletos: number): AvisoDevido {
  const proporcional = avisoPrevioProporcional(anosCompletos);
  switch (motivo) {
    case "SEM_JUSTA_CAUSA":
      return { dias: proporcional, texto: `${proporcional} dias (30 + 3 por ano completo)` };
    case "ACORDO":
      return {
        dias: proporcional,
        texto: `${proporcional} dias — metade (${Math.floor(proporcional / 2)}) se indenizado, art. 484-A`,
      };
    case "PEDIDO_DEMISSAO":
      return { dias: 30, texto: "30 dias, devidos pelo empregado" };
    case null:
    case undefined:
    case "":
      return { dias: null, texto: "Informe o motivo da saída" };
    default:
      return { dias: null, texto: "Sem aviso prévio neste motivo" };
  }
}

// ------------------------------------------------------------------
// Situação do prazo e chave do evento
// ------------------------------------------------------------------

export type SituacaoPrazo = { situacao: "VENCIDO" | "HOJE" | "NO_PRAZO"; dias: number };

/** `dias` = de hoje até o prazo (negativo quando já venceu). */
export function situacaoDoPrazo(prazo: Date, hoje: Date): SituacaoPrazo {
  const dias = diferencaEmDiasUTC(prazo, hoje);
  return { situacao: dias < 0 ? "VENCIDO" : dias === 0 ? "HOJE" : "NO_PRAZO", dias };
}

/**
 * A chave que liga um fato ao seu envio (EventoEsocialEnvio.referenciaId).
 *
 * Admissão e desligamento levam a DATA junto do id do colaborador: se o RH
 * corrigir a data depois de ter mandado ao escritório, a marcação antiga deixa
 * de valer e a pendência volta — o escritório precisa retificar o evento, e é
 * exatamente isso que a volta da pendência cobra. Acidente e afastamento são
 * registros próprios: a chave é o id deles.
 */
export function referenciaDoEvento(id: string, data?: Date | null): string {
  return data ? `${id}@${inicioDoDiaUTC(data).toISOString().slice(0, 10)}` : id;
}

/** O inverso de `referenciaDoEvento`: o id e a data (se houver). */
export function lerReferencia(referenciaId: string): { id: string; data: string | null } {
  const [id, data] = referenciaId.split("@");
  return { id, data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null };
}
