// Varredura de fichas duplicadas — cadastro da mesma pessoa duas vezes,
// geralmente porque a planilha de origem trouxe o nome grafado diferente
// ("Sousa"/"Souza") e o importador, que casa por CPF, não achou o registro
// existente (o antigo estava sem CPF, ou o CPF veio errado). Uma duplicata não
// é só sujeira: o convite de pesquisa e o envio pelo Telegram vão para o
// cadastro errado, e a pessoa nunca recebe nada.
//
// Três chaves, em ordem de força: CPF (prova), telefone (indício forte) e nome
// parecido (palpite). Quem uma chave junta, a seguinte não reavalia.
//
// DESLIGADOS ENTRAM NA COMPARAÇÃO desde 13/08/2026, e foi o que faltava. Até
// então a varredura só olhava ativos — mas a ficha duplicada quase sempre é a
// velha, encerrada, e é ela que fica segurando o telegramChatId da pessoa. O
// resultado prático: dois colaboradores tentavam entrar no portal, o bot dizia
// "já está vinculado a outro colaborador", e a tela que deveria mostrar o
// conflito jurava que não havia nenhum.
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
  ativo: boolean;
  /** Esta ficha segura um chat do Telegram. */
  temTelegram: boolean;
};

export type MotivoDuplicado = "Mesmo CPF" | "Mesmo telefone" | "Nome muito parecido";

/**
 * O quanto o grupo pede ação AGORA — e é isto que separa varredura útil de
 * lista longa que ninguém abre.
 *
 * Incluir desligados na comparação era obrigatório (é onde a ficha velha se
 * esconde) mas traz junto toda recontratação: mesma pessoa, ficha antiga
 * encerrada e ficha nova ativa, os dois com o mesmo CPF e o mesmo telefone.
 * Isso é cadastro correto, não duplicata. Sem a gravidade, uma base com
 * rotatividade normal encheria a tela de casos que não são problema — o mesmo
 * jeito de morrer do cartão que marcava 163 de 170.
 */
export type Gravidade = "alta" | "media" | "baixa";

export type GrupoDuplicado = {
  motivo: MotivoDuplicado;
  gravidade: Gravidade;
  pessoas: PessoaParaComparar[];
};

/**
 * Ficha desligada segurando o Telegram é sempre grave, e é o caso que motivou
 * esta varredura: quem está na ativa manda o CPF ao bot, o bot acha a ficha
 * certa, mas o aparelho está preso na ficha antiga — e ele recebe "já está
 * vinculado a outro colaborador" sem que ninguém enxergue onde. Duas fichas
 * ATIVAS da mesma pessoa também é erro puro: convite e pesquisa saem em
 * dobro e o bot pode escolher a errada.
 */
function gravidadeDo(pessoas: PessoaParaComparar[], motivo: MotivoDuplicado): Gravidade {
  if (pessoas.some((p) => !p.ativo && p.temTelegram)) return "alta";
  const ativos = pessoas.filter((p) => p.ativo).length;
  if (ativos >= 2) return motivo === "Nome muito parecido" ? "media" : "alta";
  // Um ativo e um desligado, sem Telegram preso: quase sempre recontratação.
  return "baixa";
}

const ORDEM_GRAVIDADE: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };
// CPF igual é prova; telefone é indício forte; nome parecido é palpite.
const ORDEM_MOTIVO: Record<MotivoDuplicado, number> = {
  "Mesmo CPF": 0,
  "Mesmo telefone": 1,
  "Nome muito parecido": 2,
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

/** Agrupa por uma chave calculada; devolve só os grupos com 2+ pessoas. */
function agruparPor(
  pessoas: PessoaParaComparar[],
  chaveDe: (p: PessoaParaComparar) => string | null,
): PessoaParaComparar[][] {
  const mapa = new Map<string, PessoaParaComparar[]>();
  for (const p of pessoas) {
    const chave = chaveDe(p);
    if (!chave) continue;
    (mapa.get(chave) ?? mapa.set(chave, []).get(chave)!).push(p);
  }
  return [...mapa.values()].filter((g) => g.length >= 2);
}

export function encontrarDuplicados(pessoas: PessoaParaComparar[]): GrupoDuplicado[] {
  const grupos: GrupoDuplicado[] = [];
  const jaAgrupado = new Set<string>(); // evita a mesma pessoa aparecer em dois grupos

  // 1) Mesmo CPF — não é indício, é prova: CPF é único por pessoa. Vem antes
  // do telefone justamente por isso, e o que ele junta não é reavaliado
  // depois.
  for (const grupo of agruparPor(pessoas, (p) => p.cpf?.replace(/\D/g, "") || null)) {
    grupos.push({ motivo: "Mesmo CPF", gravidade: gravidadeDo(grupo, "Mesmo CPF"), pessoas: grupo });
    grupo.forEach((p) => jaAgrupado.add(p.id));
  }

  // 2) Mesmo telefone — sinal forte e barato (agrupamento, não O(n²)). Só
  // entre quem o CPF ainda não juntou: ficha duplicada costuma repetir os
  // dois, e sem isso o mesmo par apareceria duas vezes na tela.
  for (const grupo of agruparPor(
    pessoas.filter((p) => !jaAgrupado.has(p.id)),
    (p) => sufixoTelefone(p.telefone),
  )) {
    grupos.push({
      motivo: "Mesmo telefone",
      gravidade: gravidadeDo(grupo, "Mesmo telefone"),
      pessoas: grupo,
    });
    grupo.forEach((p) => jaAgrupado.add(p.id));
  }

  // 3) Nome muito parecido — O(n²), mas n é "colaboradores de uma empresa"
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
        const grupo = parecidos.map((item) => item.pessoa);
        grupos.push({
          motivo: "Nome muito parecido",
          gravidade: gravidadeDo(grupo, "Nome muito parecido"),
          pessoas: grupo,
        });
      }
    }
  }

  // O que trava alguém HOJE vem primeiro; recontratação normal desce para o
  // fim. Sem ordenar, o achado que importa nasce no meio de uma lista longa.
  return grupos.sort(
    (a, b) =>
      ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade] ||
      ORDEM_MOTIVO[a.motivo] - ORDEM_MOTIVO[b.motivo],
  );
}
