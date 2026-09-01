import { diferencaEmDiasUTC } from "@/lib/datas";
import { placaValida } from "@/lib/processos/ctb";

// O EMPLACAMENTO/LICENCIAMENTO ANUAL em código PURO (sem banco, sem sessão) —
// mesma divisão de lib/processos/frota-financeiro.ts: aqui mora a decisão
// (qual mês vence pela placa, qual o semáforo), nas actions mora a execução.
// É o que scripts/test-processos-licenciamento.ts prova sem precisar de banco.
//
// A REGRA CENTRAL: o mês de pagamento DERIVA do final da placa, pelo
// calendário ESTADUAL do ano — nunca é digitado. O que se grava é só o fato
// "está em dia" (um DocumentoVeiculo tipo LICENCIAMENTO com o exercício);
// vencimento e semáforo são recalculados a cada leitura, e um carro sem o
// registro do exercício fica gritando na tela até alguém marcar — um cron que
// "arrumasse" o status esconderia exatamente a pendência que a tela existe
// para mostrar.
//
// O calendário muda TODO ANO e é POR UF (o schema do Veiculo já avisava isso
// em `ufEmplacamento`). Por isso ele é tabela de DADO — UF × ano × final —,
// não fórmula: ano sem tabela publicada aqui devolve SEM_CALENDARIO, nunca um
// chute. Ao virar o ano, o trabalho é colar a tabela nova da portaria do
// Detran e rodar o teste — um commit por ano.

/** Dia e mês (1–12) de um vencimento do calendário — o ano vem do exercício. */
type DiaMes = { dia: number; mes: number };

/**
 * As três datas de cada final de placa: 1ª parcela, 2ª parcela e a DATA
 * LIMITE (3ª parcela / pagamento integral). "As taxas e multas [...] deverão
 * ser pagas integralmente pelo usuário até a data limite da 3ª parcela" — é
 * ela que decide o vencido.
 */
type ParcelasDoFinal = [DiaMes, DiaMes, DiaMes];

/**
 * DETRAN-PB, calendário de licenciamento 2026 — Portaria nº 590/2025/DS,
 * publicada em 18/12/2025 (detran.pb.gov.br/veiculos/calendario, conferido em
 * 31/08/2026). Final 1 abre o ano (limite 31/03) e final 0 fecha (30/12).
 */
const PB_2026: Record<number, ParcelasDoFinal> = {
  1: [{ dia: 30, mes: 1 }, { dia: 27, mes: 2 }, { dia: 31, mes: 3 }],
  2: [{ dia: 27, mes: 2 }, { dia: 31, mes: 3 }, { dia: 30, mes: 4 }],
  3: [{ dia: 31, mes: 3 }, { dia: 30, mes: 4 }, { dia: 29, mes: 5 }],
  4: [{ dia: 30, mes: 4 }, { dia: 29, mes: 5 }, { dia: 30, mes: 6 }],
  5: [{ dia: 29, mes: 5 }, { dia: 30, mes: 6 }, { dia: 31, mes: 7 }],
  6: [{ dia: 30, mes: 6 }, { dia: 31, mes: 7 }, { dia: 31, mes: 8 }],
  7: [{ dia: 31, mes: 7 }, { dia: 31, mes: 8 }, { dia: 30, mes: 9 }],
  8: [{ dia: 31, mes: 8 }, { dia: 30, mes: 9 }, { dia: 30, mes: 10 }],
  9: [{ dia: 30, mes: 9 }, { dia: 30, mes: 10 }, { dia: 30, mes: 11 }],
  0: [{ dia: 30, mes: 10 }, { dia: 30, mes: 11 }, { dia: 30, mes: 12 }],
};

/** UF × exercício → tabela por final. Só entra ano com portaria publicada. */
const CALENDARIOS: Record<string, Record<number, Record<number, ParcelasDoFinal>>> = {
  PB: { 2026: PB_2026 },
};

/**
 * A frota do grupo é toda da Paraíba, mas a importação veio com
 * `ufEmplacamento` vazio em quase todos os veículos. UF vazia é ASSUMIDA como
 * PB — com a suposição dita na tela (`ufAssumida`), nunca em silêncio. Quem
 * emplacar um carro em outro estado preenche a UF no cadastro e o calendário
 * daquele estado passa a valer (ou vira SEM_CALENDARIO até a tabela existir).
 */
export const UF_ASSUMIDA_QUANDO_VAZIA = "PB";

/**
 * O final da placa que decide o mês — o ÚLTIMO dígito, nas duas grafias
 * (ABC1234 → 4, Mercosul ABC1D23 → 3). Placa fora do padrão (provisória
 * "SEMPLACA-01", legado truncado) devolve null: dela não se deriva calendário.
 */
export function finalDaPlaca(placa: string): number | null {
  if (!placaValida(placa)) return null;
  return Number(placa[placa.length - 1]);
}

export type StatusLicenciamento =
  | "EM_DIA"
  | "VENCIDO"
  | "VENCE_EM_BREVE"
  | "PENDENTE"
  | "NAO_EMPLACADO"
  | "SEM_CALENDARIO";

/** Rótulo + ícone por status: a cor NUNCA é o único sinal (acessibilidade). */
export const ROTULO_STATUS_LICENCIAMENTO: Record<StatusLicenciamento, string> = {
  EM_DIA: "🟢 Em dia",
  VENCIDO: "🚨 Vencido",
  VENCE_EM_BREVE: "🟠 Vence em breve",
  PENDENTE: "⚪ A pagar no ano",
  NAO_EMPLACADO: "🔴 Não emplacado",
  SEM_CALENDARIO: "❔ Sem calendário",
};

/** O limite do 🟠 — 30 dias: licenciamento é conta anual, avisar com folga. */
export const DIAS_ALERTA_LICENCIAMENTO = 30;

export type VeiculoParaLicenciamento = {
  placa: string;
  emplacado: boolean;
  ufEmplacamento: string | null;
  /** Já existe DocumentoVeiculo tipo LICENCIAMENTO deste exercício? */
  registradoNoExercicio: boolean;
};

export type RetratoLicenciamento = {
  status: StatusLicenciamento;
  /** O último dígito da placa — null quando a placa não deriva calendário. */
  final: number | null;
  /** A UF usada na conta (a do cadastro, ou a assumida). */
  ufEfetiva: string;
  /** true quando a UF veio vazia e a conta assumiu UF_ASSUMIDA_QUANDO_VAZIA. */
  ufAssumida: boolean;
  /** 1ª parcela — o "mês de pagamento" de quem paga parcelado. */
  primeiraParcela: Date | null;
  /** Data limite (3ª parcela / pagamento integral) — decide o vencido. */
  dataLimite: Date | null;
  /** Dias até a data limite (negativo = vencido). Null sem calendário. */
  diasParaLimite: number | null;
};

/**
 * O retrato de UM veículo no exercício: status + datas derivadas, tudo pronto
 * para a tela (§4 do Financeiro vale aqui também: o front não refaz conta).
 *
 * Ordem das regras, do fato mais forte para o mais fraco:
 *  1. NÃO EMPLACADO grita antes de tudo — sem emplacar não há licenciamento a
 *     manter em dia, e ESTE é o carro que tira a frota da regra.
 *  2. Sem final de placa ou sem tabela da UF/ano → SEM_CALENDARIO (honesto:
 *     não se inventa mês).
 *  3. Registrado no exercício → EM_DIA.
 *  4. Senão, a data limite decide: passou → VENCIDO; chega em 30 dias →
 *     VENCE_EM_BREVE; ainda longe → PENDENTE.
 */
export function retratoLicenciamento(
  veiculo: VeiculoParaLicenciamento,
  exercicio: number,
  hoje: Date,
): RetratoLicenciamento {
  const ufCadastro = (veiculo.ufEmplacamento ?? "").trim().toUpperCase();
  const ufAssumida = ufCadastro === "";
  const ufEfetiva = ufAssumida ? UF_ASSUMIDA_QUANDO_VAZIA : ufCadastro;

  const final = finalDaPlaca(veiculo.placa);
  const tabela = final === null ? undefined : CALENDARIOS[ufEfetiva]?.[exercicio]?.[final];

  const base = { final, ufEfetiva, ufAssumida };

  if (!veiculo.emplacado) {
    return {
      ...base,
      status: "NAO_EMPLACADO",
      primeiraParcela: null,
      dataLimite: null,
      diasParaLimite: null,
    };
  }
  if (!tabela) {
    return {
      ...base,
      status: "SEM_CALENDARIO",
      primeiraParcela: null,
      dataLimite: null,
      diasParaLimite: null,
    };
  }

  // Date-only em UTC, o padrão do repo (hojeUTC/diferencaEmDiasUTC): o
  // semáforo compara DIAS, e não vira de cor à meia-noite UTC.
  const [p1, , limite] = tabela;
  const primeiraParcela = new Date(Date.UTC(exercicio, p1.mes - 1, p1.dia));
  const dataLimite = new Date(Date.UTC(exercicio, limite.mes - 1, limite.dia));
  // diferencaEmDiasUTC(ate, de) = ate − de: limite no futuro dá positivo.
  const diasParaLimite = diferencaEmDiasUTC(dataLimite, hoje);

  if (veiculo.registradoNoExercicio) {
    return { ...base, status: "EM_DIA", primeiraParcela, dataLimite, diasParaLimite };
  }
  const status: StatusLicenciamento =
    diasParaLimite < 0
      ? "VENCIDO"
      : diasParaLimite <= DIAS_ALERTA_LICENCIAMENTO
        ? "VENCE_EM_BREVE"
        : "PENDENTE";
  return { ...base, status, primeiraParcela, dataLimite, diasParaLimite };
}

/**
 * A frase que a gestão quer poder dizer: "está tudo em dia". Só é verdade
 * quando NENHUM veículo está vencido, a vencer, pendente ou sem emplacar —
 * SEM_CALENDARIO entra como ressalva à parte (não dá para afirmar nada dele).
 */
export function resumoLicenciamento(retratos: RetratoLicenciamento[]): {
  total: number;
  emDia: number;
  vencidos: number;
  venceEmBreve: number;
  pendentes: number;
  naoEmplacados: number;
  semCalendario: number;
  tudoEmDia: boolean;
} {
  const conta = (s: StatusLicenciamento) => retratos.filter((r) => r.status === s).length;
  const vencidos = conta("VENCIDO");
  const venceEmBreve = conta("VENCE_EM_BREVE");
  const pendentes = conta("PENDENTE");
  const naoEmplacados = conta("NAO_EMPLACADO");
  return {
    total: retratos.length,
    emDia: conta("EM_DIA"),
    vencidos,
    venceEmBreve,
    pendentes,
    naoEmplacados,
    semCalendario: conta("SEM_CALENDARIO"),
    tudoEmDia:
      retratos.length > 0 &&
      vencidos === 0 &&
      venceEmBreve === 0 &&
      pendentes === 0 &&
      naoEmplacados === 0,
  };
}
