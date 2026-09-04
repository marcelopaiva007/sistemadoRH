/**
 * Gerador de Arquivos Fiscais Regulatórios de Ponto (Portaria MTP nº 671/2021)
 *
 * Emissão de:
 * 1. AFD (Arquivo Fonte de Dados) — REP-P
 * 2. AEJ (Arquivo Eletrônico de Jornada) — PTP
 */

export type RegistroPontoAFD = {
  // null só para marcação de origem TRATAMENTO: ela não consome NSR.
  nsr: bigint | number | null;
  tipo: string;
  dataHora: Date;
  cpfColaborador: string;
  hashSHA256: string;
  // De onde veio a marcação. BATIDA = coletada pelo REP-P (RegistroPonto), a
  // única que entra no AFD. TRATAMENTO = incluída por decisão do RH sobre um
  // pedido de inclusão manual (rh.MarcacaoTratada): jornada tratada, entra no
  // AEJ e nunca no AFD. Ausente vale BATIDA — chamadores antigos e o teste em
  // scripts/test-ponto.ts não preenchem.
  origem?: "BATIDA" | "TRATAMENTO";
  // Motivo copiado do tratamento no instante da decisão; só TRATAMENTO tem.
  justificativa?: string | null;
};

export type DadosEmpresaAFD = {
  razaoSocial: string;
  cnpj: string;
};

/**
 * Quebra um instante em ano/mês/dia/hora/minuto NO HORÁRIO DE BRASÍLIA.
 *
 * POR QUE ISTO EXISTE. Até 12/08/2026 este arquivo usava `getDate()`,
 * `getHours()` e `toISOString()` direto. Esses métodos respondem no fuso do
 * PROCESSO, e o processo roda em UTC na Vercel — então uma batida das 08:00 de
 * Brasília saía no arquivo fiscal como 11:00. Três horas de diferença em todas
 * as marcações, no documento que se entrega à fiscalização do trabalho.
 *
 * O teste não pegava porque só conferia se o CPF e o CNPJ apareciam no texto;
 * layout e horário não eram verificados.
 *
 * `en-CA` porque devolve ano-mês-dia com dois dígitos e sem nome de mês — o
 * formato não importa, só a decomposição; quem monta o texto é quem chama.
 */
const PARTES_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function emBrasilia(data: Date): {
  ano: string;
  mes: string;
  dia: string;
  hora: string;
  minuto: string;
  segundo: string;
} {
  const p = Object.fromEntries(
    PARTES_BRASILIA.formatToParts(data)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  );
  // `hour12: false` pode devolver "24" para meia-noite em alguns motores.
  const hora = p.hour === "24" ? "00" : p.hour;
  return { ano: p.year, mes: p.month, dia: p.day, hora, minuto: p.minute, segundo: p.second };
}

/**
 * Formata CPF para 11 dígitos com zeros à esquerda.
 */
function formatarCPF(cpf: string): string {
  return cpf.replace(/\D/g, "").padStart(11, "0");
}

/**
 * Formata CNPJ para 14 dígitos com zeros à esquerda.
 */
function formatarCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "").padStart(14, "0");
}

/** Origem efetiva de um registro: ausente vale BATIDA (ver RegistroPontoAFD). */
function origemDe(reg: RegistroPontoAFD): "BATIDA" | "TRATAMENTO" {
  return reg.origem ?? "BATIDA";
}

/**
 * A justificativa vai numa linha separada por "|": o separador e a quebra de
 * linha dentro do texto deslocariam as colunas de quem lê o arquivo. Viram um
 * espaço; espaços repetidos colapsam.
 */
function sanitizarJustificativa(texto: string | null | undefined): string {
  return (texto ?? "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Gera conteúdo texto do arquivo AFD (Arquivo Fonte de Dados) conforme Portaria MTP 671/2021.
 *
 * Estrutura:
 * - Cabeçalho (Tipo 1)
 * - Registros de Ponto (Tipo 3)
 * - Trailer (Tipo 9)
 */
export function gerarConteudoAFD(
  empresa: DadosEmpresaAFD,
  registros: RegistroPontoAFD[]
): string {
  // Defensivo: o AFD é o arquivo do que o REP-P COLETOU (Portaria MTP
  // 671/2021). Marcação incluída por tratamento não foi coletada e não tem
  // NSR — não pode aparecer aqui mesmo que um chamador a passe. O chamador de
  // produção (exportarArquivoAFDRH) já lê só RegistroPonto; isto é a segunda
  // trava. O trailer conta sobre a lista filtrada.
  const somenteBatidas = registros.filter((reg) => origemDe(reg) !== "TRATAMENTO");
  const linhas: string[] = [];

  // Cabeçalho - Tipo 1
  // Formato: [NSR (9)] [TIPO (1)] [TIPO_IDENT (1)] [CNPJ/CPF (14)] [RAZAO_SOCIAL (150)] [DATA_INICIO (8)] [DATA_FIM (8)]
  const dataHojeStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const razaoSocialPadded = empresa.razaoSocial.padEnd(150, " ").slice(0, 150);
  const cnpjFormatted = formatarCNPJ(empresa.cnpj);

  linhas.push(
    `000000001` + // NSR do cabeçalho
    `1` +         // Tipo de registro
    `1` +         // Tipo identificador (1 = CNPJ)
    `${cnpjFormatted}` +
    `${razaoSocialPadded}` +
    `${dataHojeStr}` +
    `${dataHojeStr}`
  );

  // Registros de Marcação - Tipo 3
  // Formato: [NSR (9)] [TIPO (1)] [DATA (8: DDMMYYYY)] [HORA (4: HHMM)] [CPF (11)]
  somenteBatidas.forEach((reg) => {
    // `?? 0` só para o tipo: depois do filtro acima toda linha é BATIDA e tem NSR.
    const nsrStr = String(reg.nsr ?? 0).padStart(9, "0");
    const { ano, mes, dia, hora, minuto } = emBrasilia(new Date(reg.dataHora));
    const cpfFormatted = formatarCPF(reg.cpfColaborador);

    linhas.push(
      `${nsrStr}` +
      `3` +
      `${dia}${mes}${ano}` +
      `${hora}${minuto}` +
      `${cpfFormatted}`
    );
  });

  // Trailer - Tipo 9
  const qtdRegistrosStr = String(somenteBatidas.length + 2).padStart(9, "0");
  linhas.push(`${qtdRegistrosStr}9`);

  return linhas.join("\r\n");
}

/**
 * Gera conteúdo texto do arquivo AEJ (Arquivo Eletrônico de Jornada) conforme Portaria MTP 671/2021.
 * Utilizado para transferência de dados de jornada processados ao MTE / Auditoria Fiscal.
 */
export function gerarConteudoAEJ(
  empresa: DadosEmpresaAFD,
  registros: RegistroPontoAFD[]
): string {
  const linhas: string[] = [];
  const dataHojeStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const cnpjFormatted = formatarCNPJ(empresa.cnpj);

  // Cabeçalho AEJ (Tipo 1)
  linhas.push(`000000001|1|AEJ|${cnpjFormatted}|${empresa.razaoSocial}|${dataHojeStr}`);

  // Registros de Jornada (Tipo 2)
  registros.forEach((reg) => {
    // Antes daqui saía data em UTC (`toISOString`) e hora no fuso do processo
    // (`toTimeString`) — dois relógios diferentes na mesma linha, que perto da
    // meia-noite davam data de um dia e hora de outro.
    const { ano, mes, dia, hora, minuto } = emBrasilia(new Date(reg.dataHora));
    const dataStr = `${ano}-${mes}-${dia}`;
    const horaStr = `${hora}:${minuto}`;
    const cpfFormatted = formatarCPF(reg.cpfColaborador);

    // Marcação tratada sai DISTINGUÍVEL: NSR vazio (não consumiu número do
    // REP-P), origem TRATAMENTO e a justificativa da decisão. O formato é
    // próprio da casa, separado por "|": os dois campos entram no FIM para
    // não deslocar quem já lê as sete primeiras colunas. Batida sai com
    // origem BATIDA e justificativa vazia.
    const nsrStr = reg.nsr === null || reg.nsr === undefined ? "" : String(reg.nsr);
    linhas.push(
      `2|${nsrStr}|${cpfFormatted}|${dataStr}|${horaStr}|${reg.tipo}|${reg.hashSHA256}|${origemDe(reg)}|${sanitizarJustificativa(reg.justificativa)}`,
    );
  });

  // Trailer AEJ (Tipo 9)
  linhas.push(`9|${registros.length + 2}`);

  return linhas.join("\r\n");
}
