// Funções de exportação de contracheques para conformidade e auditoria trabalhista.

export type LinhaExportacaoContracheque = {
  colaboradorNome: string;
  colaboradorCpf: string;
  empresaNome: string;
  cnpj: string;
  setor: string;
  email: string;
  temTelegram: string;
  folha: string;
  situacao: string;
  enviadoEm: string;
  cienciaEm: string;
  vistoEm: string;
  confirmadoEm: string;
  ip: string;
  hash: string;
  lembretesEnviados: number;
};

function escaparCsv(valor: unknown): string {
  const str = String(valor ?? "");
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Gera conteúdo CSV compatível com Excel (separador ponto-e-vírgula e BOM UTF-8). */
export function montarCsvContracheques(linhas: LinhaExportacaoContracheque[]): string {
  const cabecalho = [
    "Colaborador",
    "CPF",
    "Empresa",
    "CNPJ",
    "Setor",
    "E-mail",
    "Telegram Vinculado",
    "Competência / Folha",
    "Situação",
    "Enviado Em",
    "Ciência Telegram Em",
    "Visto Em",
    "Confirmado Em",
    "IP de Assinatura",
    "Hash SHA-256",
    "Lembretes Enviados",
  ];

  const linhasTexto = linhas.map((l) =>
    [
      escaparCsv(l.colaboradorNome),
      escaparCsv(l.colaboradorCpf),
      escaparCsv(l.empresaNome),
      escaparCsv(l.cnpj),
      escaparCsv(l.setor),
      escaparCsv(l.email),
      escaparCsv(l.temTelegram),
      escaparCsv(l.folha),
      escaparCsv(l.situacao),
      escaparCsv(l.enviadoEm),
      escaparCsv(l.cienciaEm),
      escaparCsv(l.vistoEm),
      escaparCsv(l.confirmadoEm),
      escaparCsv(l.ip),
      escaparCsv(l.hash),
      escaparCsv(l.lembretesEnviados),
    ].join(";")
  );

  // \uFEFF adiciona o Byte Order Mark (BOM) UTF-8 para o Excel abrir com acentuação correta
  return "\uFEFF" + [cabecalho.join(";"), ...linhasTexto].join("\r\n");
}
