// Leitura da planilha de acessos Mobility — CSV baixado do Google Sheets
// (Arquivo › Fazer download › .csv) ou as células coladas direto da planilha
// (que chegam separadas por TAB). Função pura, sem banco: testável sozinha.

export type LinhaDeAcesso = {
  nome: string;
  cpf: string;
  email: string;
  senha: string;
  placa: string;
  modelo: string;
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

// Nome da coluna na planilha → campo. Aceita variações comuns de cabeçalho.
const COLUNAS: Record<string, keyof LinhaDeAcesso> = {
  nome: "nome",
  motorista: "nome",
  cpf: "cpf",
  email: "email",
  login: "email",
  usuario: "email",
  senha: "senha",
  placa: "placa",
  modelo: "modelo",
  veiculo: "modelo",
};

/** Divide uma linha respeitando aspas ("a, b" é um campo só). */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  // A senha NÃO é aparada: espaço pode fazer parte dela. O resto é.
  return campos;
}

export function lerPlanilhaDeAcessos(
  texto: string,
): { ok: true; linhas: LinhaDeAcesso[] } | { ok: false; error: string } {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return { ok: false, error: "A planilha precisa do cabeçalho e de ao menos uma linha." };

  const cab = linhas[0];
  const sep = cab.includes("\t") ? "\t" : cab.split(";").length > cab.split(",").length ? ";" : ",";
  const indices = dividir(cab, sep).map((c) => COLUNAS[normalizar(c)]);
  if (!indices.includes("nome") || !indices.includes("email")) {
    return { ok: false, error: "Não achei as colunas Nome e E-mail no cabeçalho da planilha." };
  }

  const resultado = linhas.slice(1).map((l) => {
    const campos = dividir(l, sep);
    const r: LinhaDeAcesso = { nome: "", cpf: "", email: "", senha: "", placa: "", modelo: "" };
    indices.forEach((campo, i) => {
      if (!campo) return;
      const v = campos[i] ?? "";
      r[campo] = campo === "senha" ? v : v.trim();
    });
    return r;
  });
  return { ok: true, linhas: resultado };
}
