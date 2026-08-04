// Rubricas que o RH manda para a folha todo mês.
//
// Este sistema NÃO calcula folha: não sabe salário-hora, INSS, IRRF nem FGTS.
// Ele informa quantidade e valor; quem transforma em dinheiro é o Domínio, no
// escritório contábil. Por isso `unidade` importa — o contador precisa saber
// se "8" são horas ou dias.

export type UnidadeRubrica = "HORAS" | "DIAS" | "VALOR";
export type NaturezaRubrica = "PROVENTO" | "DESCONTO" | "INFORMATIVO";

export const RUBRICAS = [
  { value: "HORA_EXTRA_50", label: "Hora extra 50%", unidade: "HORAS", natureza: "PROVENTO" },
  { value: "HORA_EXTRA_100", label: "Hora extra 100%", unidade: "HORAS", natureza: "PROVENTO" },
  { value: "ADICIONAL_NOTURNO", label: "Adicional noturno", unidade: "HORAS", natureza: "PROVENTO" },
  { value: "SOBREAVISO", label: "Sobreaviso / prontidão", unidade: "HORAS", natureza: "PROVENTO" },
  { value: "COMISSAO", label: "Comissão", unidade: "VALOR", natureza: "PROVENTO" },
  { value: "BONUS", label: "Bônus / premiação", unidade: "VALOR", natureza: "PROVENTO" },
  { value: "AJUDA_CUSTO", label: "Ajuda de custo", unidade: "VALOR", natureza: "PROVENTO" },
  { value: "FALTA", label: "Falta injustificada", unidade: "DIAS", natureza: "DESCONTO" },
  { value: "ATRASO", label: "Atraso", unidade: "HORAS", natureza: "DESCONTO" },
  { value: "ADIANTAMENTO", label: "Adiantamento", unidade: "VALOR", natureza: "DESCONTO" },
  { value: "DESCONTO", label: "Desconto diverso", unidade: "VALOR", natureza: "DESCONTO" },
  // Benefícios vêm de BeneficioColaborador (Fase 2). Entram como informativo:
  // o valor mensal já é conhecido, o contador só precisa conferir quem tem.
  { value: "BENEFICIO", label: "Benefício (informativo)", unidade: "VALOR", natureza: "INFORMATIVO" },
  { value: "OUTRO", label: "Outro", unidade: "VALOR", natureza: "INFORMATIVO" },
] as const satisfies readonly {
  value: string;
  label: string;
  unidade: UnidadeRubrica;
  natureza: NaturezaRubrica;
}[];

export type Rubrica = (typeof RUBRICAS)[number]["value"];

// Rubricas que somam como hora extra para o teto legal. Adicional noturno e
// sobreaviso também são horas, mas não são jornada extraordinária — entrar com
// eles aqui acusaria excesso onde não há.
export const RUBRICAS_HORA_EXTRA = ["HORA_EXTRA_50", "HORA_EXTRA_100"] as const;

// Teto mensal de horas extras: a CLT (art. 59) limita a 2 horas por dia, o que
// dá 44h num mês de 22 dias úteis. Não é um número exato do mês corrente — é o
// ponto a partir do qual a jornada extraordinária deixou de ser exceção e o RH
// precisa olhar. Passar disso é risco de autuação e de horas impagáveis.
export const LIMITE_HORAS_EXTRAS_MES = 44;

export const rubricaLabel = (v: string) => RUBRICAS.find((r) => r.value === v)?.label ?? v;
export const rubricaUnidade = (v: string): UnidadeRubrica =>
  RUBRICAS.find((r) => r.value === v)?.unidade ?? "VALOR";
export const rubricaNatureza = (v: string): NaturezaRubrica =>
  RUBRICAS.find((r) => r.value === v)?.natureza ?? "INFORMATIVO";

/** Rubricas que o sistema traz sozinho de outros módulos — o RH não digita. */
export const RUBRICAS_DERIVADAS: readonly string[] = ["FALTA", "BENEFICIO"];

export const unidadeLabel: Record<UnidadeRubrica, string> = {
  HORAS: "h",
  DIAS: "dia(s)",
  VALOR: "R$",
};

/** Primeiro dia do mês em UTC — competência é mês, não data. */
export function competenciaUTC(ano: number, mes1a12: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, 1));
}

/** "07/2026" para exibição. */
export function formatarCompetencia(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Último instante do mês da competência — limite superior das buscas por período. */
export function fimDaCompetencia(referencia: Date): Date {
  return new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1) - 1);
}
