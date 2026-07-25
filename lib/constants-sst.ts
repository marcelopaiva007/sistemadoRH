// Saúde e Segurança do Trabalho — normas e exames.
//
// A lista de NRs é a das que fazem sentido numa operação de telecom com equipe
// em campo; `validadePadraoMeses` é só a sugestão que o formulário preenche —
// a periodicidade que vale é a cadastrada no requisito da função, porque varia
// com a atividade (NR-10 SEP recicla em 12 meses, o básico em 24).

export const NORMAS_REGULAMENTADORAS = [
  { value: "NR-01", label: "NR-01 — Disposições gerais e gerenciamento de riscos", validadePadraoMeses: null },
  { value: "NR-05", label: "NR-05 — CIPA", validadePadraoMeses: 12 },
  { value: "NR-06", label: "NR-06 — EPI", validadePadraoMeses: null },
  { value: "NR-10", label: "NR-10 — Segurança em instalações elétricas", validadePadraoMeses: 24 },
  { value: "NR-10-SEP", label: "NR-10 SEP — Sistema Elétrico de Potência", validadePadraoMeses: 12 },
  { value: "NR-11", label: "NR-11 — Transporte e movimentação de materiais", validadePadraoMeses: 12 },
  { value: "NR-12", label: "NR-12 — Máquinas e equipamentos", validadePadraoMeses: 24 },
  { value: "NR-17", label: "NR-17 — Ergonomia", validadePadraoMeses: null },
  { value: "NR-18", label: "NR-18 — Construção civil", validadePadraoMeses: 12 },
  { value: "NR-20", label: "NR-20 — Inflamáveis e combustíveis", validadePadraoMeses: 12 },
  { value: "NR-23", label: "NR-23 — Proteção contra incêndios", validadePadraoMeses: 12 },
  { value: "NR-33", label: "NR-33 — Espaços confinados", validadePadraoMeses: 12 },
  { value: "NR-34", label: "NR-34 — Construção e reparação naval", validadePadraoMeses: 12 },
  { value: "NR-35", label: "NR-35 — Trabalho em altura", validadePadraoMeses: 24 },
  { value: "DIRECAO-DEFENSIVA", label: "Direção defensiva", validadePadraoMeses: 24 },
] as const;

export const TIPOS_EXAME = [
  { value: "ADMISSIONAL", label: "Admissional", validadePadraoMeses: 12 },
  { value: "PERIODICO", label: "Periódico", validadePadraoMeses: 12 },
  { value: "RETORNO_TRABALHO", label: "Retorno ao trabalho", validadePadraoMeses: 12 },
  { value: "MUDANCA_FUNCAO", label: "Mudança de função/risco", validadePadraoMeses: 12 },
  { value: "DEMISSIONAL", label: "Demissional", validadePadraoMeses: null },
] as const;

export const RESULTADOS_EXAME = [
  { value: "APTO", label: "Apto" },
  { value: "APTO_COM_RESTRICAO", label: "Apto com restrição" },
  { value: "INAPTO", label: "Inapto" },
] as const;

// O demissional encerra o vínculo: não entra em controle de vencimento.
export const TIPOS_EXAME_COM_VALIDADE = TIPOS_EXAME.filter((t) => t.validadePadraoMeses !== null);

const rotulo = <T extends readonly { value: string; label: string }[]>(lista: T) =>
  (v: string | null | undefined) => (v ? lista.find((i) => i.value === v)?.label ?? v : "—");

export const normaLabel = rotulo(NORMAS_REGULAMENTADORAS);
export const tipoExameLabel = rotulo(TIPOS_EXAME);
export const resultadoExameLabel = rotulo(RESULTADOS_EXAME);

/** Rótulo curto para tabela e etiqueta: "NR-35" em vez do nome inteiro. */
export const normaCurta = (v: string) => v;

export const validadePadraoDaNorma = (norma: string) =>
  NORMAS_REGULAMENTADORAS.find((n) => n.value === norma)?.validadePadraoMeses ?? null;

export const validadePadraoDoExame = (tipo: string) =>
  TIPOS_EXAME.find((t) => t.value === tipo)?.validadePadraoMeses ?? null;
