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
    const d = new Date(reg.dataHora);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const cpfFormatted = formatarCPF(reg.cpfColaborador);

    linhas.push(
      `${nsrStr}` +
      `3` +
      `${dd}${mm}${yyyy}` +
      `${hh}${min}` +
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
    const d = new Date(reg.dataHora);
    const dataStr = d.toISOString().slice(0, 10);
    const horaStr = d.toTimeString().slice(0, 5);
    const cpfFormatted = formatarCPF(reg.cpfColaborador);

    linhas.push(`2|${reg.nsr}|${cpfFormatted}|${dataStr}|${horaStr}|${reg.tipo}|${reg.hashSHA256}`);
  });

  // Trailer AEJ (Tipo 9)
  linhas.push(`9|${registros.length + 2}`);

  return linhas.join("\r\n");
}
