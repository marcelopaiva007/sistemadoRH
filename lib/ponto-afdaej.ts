/**
 * Gerador de Arquivos Fiscais Regulatórios de Ponto (Portaria MTP nº 671/2021)
 *
 * Emissão de:
 * 1. AFD (Arquivo Fonte de Dados) — REP-P
 * 2. AEJ (Arquivo Eletrônico de Jornada) — PTP
 */

export type RegistroPontoAFD = {
  nsr: bigint | number;
  tipo: string;
  dataHora: Date;
  cpfColaborador: string;
  hashSHA256: string;
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
  registros.forEach((reg) => {
    const nsrStr = String(reg.nsr).padStart(9, "0");
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
  const qtdRegistrosStr = String(registros.length + 2).padStart(9, "0");
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

    linhas.push(`2|${reg.nsr}|${cpfFormatted}|${dataStr}|${horaStr}|${reg.tipo}|${reg.hashSHA256}`);
  });

  // Trailer AEJ (Tipo 9)
  linhas.push(`9|${registros.length + 2}`);

  return linhas.join("\r\n");
}
