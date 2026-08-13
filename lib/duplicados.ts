// Detector de prováveis fichas duplicadas — cadastro da mesma pessoa duas
// vezes, geralmente porque a planilha de origem trouxe o nome grafado
// diferente ("Sousa"/"Souza") e o importador, que casa por CPF, não achou o
// registro existente (o antigo estava sem CPF, ou o CPF veio errado). Uma
// duplicata não é só sujeira: o convite de pesquisa e o envio pelo Telegram
// vão para o cadastro errado, e a pessoa nunca recebe nada.
//
// Puro e sem I/O de propósito: roda no cliente, sobre a mesma lista que a
// tela de Colaboradores já carregou — nenhuma consulta a mais ao banco.

import { sufixoTelefone } from "@/lib/telefone";

export type PessoaParaComparar = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  setorNome: string;
};

export type GrupoDuplicado = {
  motivo: "Mesmo telefone" | "Nome muito parecido";
  pessoas: PessoaParaComparar[];
};

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de Levenshtein — número mínimo de edições para uma string virar a outra. */
function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual.push(Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo));
    }
    anterior = atual;
  }
  return anterior[n];
}

/**
 * Só compara nomes de tamanho parecido (a diferença de comprimento já conta
 * como distância) e exige que a distância seja pequena TAMBÉM em proporção ao
 * tamanho do nome — "Sousa"/"Souza" (distância 1) pega; dois "Silva" quaisquer
 * do mesmo setor, com nomes diferentes por trás, não.
 */
function nomesParecidos(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  const limiar = a.length <= 20 ? 1 : 2;
  return distancia(a, b) <= limiar;
}

export function encontrarDuplicados(pessoas: PessoaParaComparar[]): GrupoDuplicado[] {
  const grupos: GrupoDuplicado[] = [];
  const jaAgrupado = new Set<string>(); // evita a mesma pessoa aparecer em dois grupos

  // 1) Mesmo telefone — sinal forte e barato (agrupamento, não O(n²)).
  const porTelefone = new Map<string, PessoaParaComparar[]>();
  for (const p of pessoas) {
    const chave = sufixoTelefone(p.telefone);
    if (!chave) continue;
    (porTelefone.get(chave) ?? porTelefone.set(chave, []).get(chave)!).push(p);
  }
  for (const grupo of porTelefone.values()) {
    if (grupo.length < 2) continue;
    grupos.push({ motivo: "Mesmo telefone", pessoas: grupo });
    grupo.forEach((p) => jaAgrupado.add(p.id));
  }

  // 2) Nome muito parecido — O(n²), mas n é "colaboradores de uma empresa"
  // (algumas centenas), então continua instantâneo. Bucket pelas duas
  // primeiras letras do nome normalizado corta a maior parte das comparações.
  const normalizados = pessoas
    .filter((p) => !jaAgrupado.has(p.id))
    .map((p) => ({ pessoa: p, nome: normalizarNome(p.nome) }));
  const buckets = new Map<string, typeof normalizados>();
  for (const item of normalizados) {
    const chave = item.nome.slice(0, 2);
    (buckets.get(chave) ?? buckets.set(chave, []).get(chave)!).push(item);
  }

  const vistos = new Set<string>();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      if (vistos.has(bucket[i].pessoa.id)) continue;
      const parecidos = [bucket[i]];
      for (let j = i + 1; j < bucket.length; j++) {
        if (vistos.has(bucket[j].pessoa.id)) continue;
        if (nomesParecidos(bucket[i].nome, bucket[j].nome)) parecidos.push(bucket[j]);
      }
      if (parecidos.length > 1) {
        parecidos.forEach((item) => vistos.add(item.pessoa.id));
        grupos.push({ motivo: "Nome muito parecido", pessoas: parecidos.map((item) => item.pessoa) });
      }
    }
  }

  return grupos;
}
