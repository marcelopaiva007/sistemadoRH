/**
 * CSV de verdade, sem biblioteca.
 *
 * Por que não uma dependência: o único pacote de planilha que o projeto já
 * teve (xlsx) foi removido por vulnerabilidade sem correção publicada — e um
 * importador faz parsing de arquivo enviado por usuário, exatamente onde não
 * se quer código de terceiros vulnerável. CSV o Excel salva nativamente
 * ("Salvar como → CSV"), então cobre o caso real sem risco.
 *
 * Pegadinhas do Excel brasileiro que este arquivo trata:
 * - Separador `;` (o Excel pt-BR usa ponto e vírgula, porque a vírgula é o
 *   decimal). Detectamos `;` ou `,` pela primeira linha.
 * - BOM UTF-8 no início do arquivo — o Excel escreve, e sem removê-lo a
 *   primeira coluna viraria "<BOM>nome" e nunca casaria com o cabeçalho.
 * - Campos entre aspas com aspas dobradas, quebras de linha DENTRO de campo
 *   e CRLF no fim de linha.
 * - Latin-1: planilha salva como "CSV" clássico no Windows vem em cp1252.
 *   Decodificamos com fallback quando o UTF-8 não bate.
 */

export type LinhaCsv = Record<string, string>;

/** Decodifica bytes como UTF-8; se houver caractere de substituição, tenta latin-1. */
export function decodificarCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // � é o "�" que o decoder põe onde o byte não era UTF-8 válido. Se
  // apareceu, o arquivo veio do Excel antigo em cp1252 — o latin1 cobre os
  // acentos do português.
  if (utf8.includes("�")) {
    return new TextDecoder("latin1").decode(bytes);
  }
  return utf8;
}

/** Detecta o separador olhando a linha do cabeçalho: `;` ganha se aparecer. */
export function detectarSeparador(conteudo: string): ";" | "," {
  const primeiraLinha = conteudo.slice(0, conteudo.indexOf("\n") === -1 ? undefined : conteudo.indexOf("\n"));
  // Conta fora de aspas, para um título com vírgula não enganar a detecção.
  let dentroDeAspas = false;
  let pontoEVirgula = 0;
  let virgula = 0;
  for (const ch of primeiraLinha) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas && ch === ";") pontoEVirgula++;
    else if (!dentroDeAspas && ch === ",") virgula++;
  }
  return pontoEVirgula > 0 ? ";" : ",";
}

/**
 * Divide o conteúdo em linhas de campos, respeitando aspas.
 * Devolve arrays crus — quem dá nome às colunas é `lerCsv`.
 */
function dividirCsv(conteudo: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let dentroDeAspas = false;

  for (let i = 0; i < conteudo.length; i++) {
    const ch = conteudo[i];

    if (dentroDeAspas) {
      if (ch === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++; // aspas dobradas = uma aspas literal
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += ch; // inclusive \n — quebra dentro de aspas é conteúdo
      }
      continue;
    }

    if (ch === '"') {
      dentroDeAspas = true;
    } else if (ch === separador) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n") {
      linha.push(campo.endsWith("\r") ? campo.slice(0, -1) : campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += ch;
    }
  }
  // Última linha sem \n final
  if (campo !== "" || linha.length > 0) {
    linha.push(campo.endsWith("\r") ? campo.slice(0, -1) : campo);
    linhas.push(linha);
  }
  return linhas;
}

/** Normaliza cabeçalho: minúsculas, sem acento, espaços viram _. */
export function normalizarCabecalho(nome: string): string {
  return nome
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Lê um CSV completo: cabeçalho na primeira linha, uma LinhaCsv por linha de
 * dados. Linhas totalmente vazias são puladas (o Excel adora deixar sobras no
 * fim). `numeroDaLinha` é o número REAL no arquivo (1 = cabeçalho), para o
 * relatório de erros apontar a linha que a pessoa vê na planilha.
 */
export function lerCsv(bytes: Uint8Array): {
  colunas: string[];
  linhas: { numeroDaLinha: number; dados: LinhaCsv }[];
} {
  const conteudo = decodificarCsv(bytes).replace(/^\uFEFF/, "");
  const separador = detectarSeparador(conteudo);
  const cruas = dividirCsv(conteudo, separador);
  if (cruas.length === 0) return { colunas: [], linhas: [] };

  const colunas = cruas[0].map(normalizarCabecalho);
  const linhas: { numeroDaLinha: number; dados: LinhaCsv }[] = [];

  for (let i = 1; i < cruas.length; i++) {
    const valores = cruas[i];
    if (valores.every((v) => v.trim() === "")) continue;
    const dados: LinhaCsv = {};
    colunas.forEach((col, j) => {
      if (col) dados[col] = (valores[j] ?? "").trim();
    });
    linhas.push({ numeroDaLinha: i + 1, dados });
  }
  return { colunas, linhas };
}

/** Escapa um campo para escrita: aspas quando tiver separador, aspas ou quebra. */
function campoCsv(v: string): string {
  return /[";,\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Gera um CSV que o Excel pt-BR abre certo com dois cliques: BOM UTF-8 (sem
 * ele, acento vira mojibake) e separador `;` (com vírgula, tudo cai numa
 * coluna só).
 */
export function gerarCsv(colunas: string[], linhas: string[][]): string {
  const corpo = [colunas, ...linhas].map((l) => l.map(campoCsv).join(";")).join("\r\n");
  return "\uFEFF" + corpo + "\r\n";
}
