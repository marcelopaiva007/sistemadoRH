// Regras puras da importação de colaboradores que encostam no CATÁLOGO da
// marca (setores e cargos) e no HISTÓRICO do colaborador (Movimentacao).
//
// Funções puras — nada aqui toca o Prisma. A action (lib/actions/rh-importacao.ts)
// carrega o que precisa em poucas consultas e pergunta para estas funções o que
// fazer; o teste (scripts/test-importacao-catalogo.ts) cobre as regras sem banco.
import { normalizarTexto } from "@/lib/text";
import { extrairRadicalSetor } from "@/lib/setores-semelhantes";
import { extrairRadicalCargo } from "@/lib/cargos-semelhantes";

// ─── Casamento de setor/cargo no catálogo da MARCA ─────────────────────────
//
// Até 26/11/2026 a importação procurava o setor e o cargo da planilha SÓ no
// CNPJ de destino. Só que o catálogo é da MARCA (o cadastro do colaborador
// aceita setor/cargo de qualquer CNPJ irmão — validarSetorEPosicaoDaMarca em
// rh-colaboradores.ts): a higienização de ago/2026 deixou cada nome vivo numa
// única linha do grupo, e a importação, sem enxergar essa linha, recriava
// "Vendas" no CNPJ de destino a cada planilha. Era a fábrica das duplicatas que
// as telas "Unificar" de Setores e Cargos viviam limpando.
//
// A régua agora é a MESMA das telas de unificar, em duas passadas:
//   1. nome igual (sem acento, caixa e espaço sobrando) em qualquer CNPJ da marca;
//   2. mesmo RADICAL (extrairRadicalSetor / extrairRadicalCargo): "Comercial" →
//      "Vendas", "Vendedora" → "Vendedor", "Aux. Administrativo" → "Auxiliar
//      Administrativo". É exatamente o que a tela de unificar juntaria depois.
// A semelhança "por digitação" (Levenshtein) das telas fica DE FORA: lá ela é
// só sugestão para um humano decidir, aqui viraria decisão automática.
//
// Empate (o catálogo já tem duplicata): ativo antes de inativo, o CNPJ de
// destino antes dos irmãos, e por fim o nome — determinístico, para a
// conferência e a confirmação escolherem a mesma linha.

export type TipoCatalogo = "setor" | "cargo";

export type ItemCatalogo = {
  id: string;
  nome: string;
  empresaId: string;
  ativo: boolean;
};

export type ResolucaoCatalogo =
  | { tipo: "existente"; id: string; nome: string; porRadical: boolean }
  | { tipo: "novo"; nome: string };

export type CasamentoCatalogo = {
  /** Chave = chaveDeNome(nome da planilha). */
  resolucao: Map<string, ResolucaoCatalogo>;
  /** Nomes a criar no CNPJ de destino — um por radical, na grafia da 1ª linha. */
  novos: string[];
  /** Nome da planilha que casou com um cadastro de grafia diferente. */
  casadosComOutroNome: { planilha: string; cadastro: string }[];
};

/** Nome comparável: sem acento, caixa ou espaço sobrando. */
export function chaveDeNome(nome: string): string {
  return normalizarTexto(nome);
}

export function radicalDe(tipo: TipoCatalogo, nome: string): string {
  return tipo === "setor" ? extrairRadicalSetor(nome) : extrairRadicalCargo(nome);
}

function melhorItem(a: ItemCatalogo, b: ItemCatalogo, empresaIdDestino: string): ItemCatalogo {
  if (a.ativo !== b.ativo) return a.ativo ? a : b;
  const aDestino = a.empresaId === empresaIdDestino;
  const bDestino = b.empresaId === empresaIdDestino;
  if (aDestino !== bDestino) return aDestino ? a : b;
  const porNome = a.nome.localeCompare(b.nome, "pt-BR");
  if (porNome !== 0) return porNome < 0 ? a : b;
  return a.id <= b.id ? a : b;
}

export function casarNoCatalogo(
  tipo: TipoCatalogo,
  nomesDaPlanilha: string[],
  catalogoDaMarca: ItemCatalogo[],
  empresaIdDestino: string,
): CasamentoCatalogo {
  const porChave = new Map<string, ItemCatalogo>();
  const porRadical = new Map<string, ItemCatalogo>();
  for (const item of catalogoDaMarca) {
    const chave = chaveDeNome(item.nome);
    const atualChave = porChave.get(chave);
    porChave.set(chave, atualChave ? melhorItem(atualChave, item, empresaIdDestino) : item);

    const radical = radicalDe(tipo, item.nome);
    if (!radical) continue;
    const atualRadical = porRadical.get(radical);
    porRadical.set(radical, atualRadical ? melhorItem(atualRadical, item, empresaIdDestino) : item);
  }

  const resolucao = new Map<string, ResolucaoCatalogo>();
  const novosPorRadical = new Map<string, string>();
  const novos: string[] = [];
  const casadosComOutroNome: { planilha: string; cadastro: string }[] = [];

  for (const bruto of nomesDaPlanilha) {
    const nome = bruto.trim();
    const chave = chaveDeNome(nome);
    if (!chave || resolucao.has(chave)) continue;

    const exato = porChave.get(chave);
    if (exato) {
      resolucao.set(chave, { tipo: "existente", id: exato.id, nome: exato.nome, porRadical: false });
      continue;
    }

    const radical = radicalDe(tipo, nome);
    const parecido = radical ? porRadical.get(radical) : undefined;
    if (parecido) {
      resolucao.set(chave, { tipo: "existente", id: parecido.id, nome: parecido.nome, porRadical: true });
      casadosComOutroNome.push({ planilha: nome, cadastro: parecido.nome });
      continue;
    }

    // Duas grafias do mesmo cargo NOVO na mesma planilha ("Vendedor" e
    // "Vendedora") viram UM cadastro só — senão a própria importação já
    // nasceria com uma duplicata para unificar.
    const chaveNovo = radical || chave;
    const jaNovo = novosPorRadical.get(chaveNovo);
    if (jaNovo) {
      resolucao.set(chave, { tipo: "novo", nome: jaNovo });
      if (chaveDeNome(jaNovo) !== chave) casadosComOutroNome.push({ planilha: nome, cadastro: jaNovo });
      continue;
    }
    novosPorRadical.set(chaveNovo, nome);
    novos.push(nome);
    resolucao.set(chave, { tipo: "novo", nome });
  }

  return { resolucao, novos, casadosComOutroNome };
}

// ─── Mudança de setor, cargo ou salário → Movimentacao ─────────────────────
//
// Até 26/11/2026 a importação trocava setor, cargo e salário de quem já existia
// sem deixar rastro na aba "Movimentações" da ficha — a pessoa aparecia num
// setor novo sem data nem origem, e o histórico de carreira ficava com buraco.
// A regra agora é a mesma da movimentação manual (rh-movimentacoes.ts): grava o
// ANTES e o DEPOIS por nome (snapshot), com a origem "importação" no motivo.
//
// Tipo: cargo mudou → MUDANCA_CARGO (leva o setor junto, se também mudou);
// só setor → TRANSFERENCIA_SETOR; só salário → OUTRO. Promoção NÃO é inferida:
// cargo novo com salário maior pode ser promoção ou correção de cadastro, e
// quem sabe é o RH, não a planilha.
//
// Salário que estava VAZIO e a planilha preenche não é movimentação — é a ficha
// sendo completada, não um reajuste.

export type SituacaoFuncional = {
  setorId: string;
  setorNome: string;
  posicaoId: string;
  posicaoNome: string;
  salarioBase: number | null;
};

export type MovimentacaoPlanejada = {
  tipo: "MUDANCA_CARGO" | "TRANSFERENCIA_SETOR" | "OUTRO";
  setorAnteriorNome?: string;
  setorNovoId?: string;
  setorNovoNome?: string;
  posicaoAnteriorNome?: string;
  posicaoNovaId?: string;
  posicaoNovaNome?: string;
  salarioAnterior?: number;
  salarioNovo?: number;
};

export function salariosDiferentes(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) >= 0.005;
}

export function movimentacaoDaImportacao(
  antes: SituacaoFuncional,
  depois: SituacaoFuncional,
): MovimentacaoPlanejada | null {
  const mudouSetor = antes.setorId !== depois.setorId;
  const mudouCargo = antes.posicaoId !== depois.posicaoId;
  const mudouSalario =
    antes.salarioBase !== null &&
    depois.salarioBase !== null &&
    salariosDiferentes(antes.salarioBase, depois.salarioBase);

  if (!mudouSetor && !mudouCargo && !mudouSalario) return null;

  const mov: MovimentacaoPlanejada = {
    tipo: mudouCargo ? "MUDANCA_CARGO" : mudouSetor ? "TRANSFERENCIA_SETOR" : "OUTRO",
  };
  if (mudouSetor) {
    mov.setorAnteriorNome = antes.setorNome;
    mov.setorNovoId = depois.setorId;
    mov.setorNovoNome = depois.setorNome;
  }
  if (mudouCargo) {
    mov.posicaoAnteriorNome = antes.posicaoNome;
    mov.posicaoNovaId = depois.posicaoId;
    mov.posicaoNovaNome = depois.posicaoNome;
  }
  if (mudouSalario) {
    mov.salarioAnterior = antes.salarioBase!;
    mov.salarioNovo = depois.salarioBase!;
  }
  return mov;
}

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O texto do campo `motivo` — diz de onde veio e, se houver, o salário. */
export function motivoDaMovimentacaoImportada(arquivoNome: string, mov: MovimentacaoPlanejada): string {
  const partes = [`Importação de planilha "${arquivoNome}"`];
  if (mov.salarioAnterior !== undefined && mov.salarioNovo !== undefined) {
    partes.push(`salário-base ${reais(mov.salarioAnterior)} → ${reais(mov.salarioNovo)}`);
  }
  return partes.join(" · ");
}

// ─── O que a planilha muda de fato num colaborador existente ───────────────
//
// Campo vazio na planilha não apaga o que a ficha tem (regra de sempre). E
// linha que não muda nada não vira UPDATE: na reimportação da mesma planilha a
// maioria das linhas é igual ao banco, e cada UPDATE é uma ida ao banco dentro
// da transação — era isso que estourava o tempo em planilha grande.

export type FichaAtual = {
  nome: string;
  cpf: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  dataAdmissao: string | null; // yyyy-mm-dd
  dataNascimento: string | null; // yyyy-mm-dd
  salarioBase: number | null;
  tipoContrato: string | null;
  setorId: string;
  posicaoId: string;
};

/** A linha da planilha já com setor/cargo resolvidos em id. */
export type LinhaParaFicha = FichaAtual;

/** Só os campos que mudam. Objeto vazio = nada a gravar. */
export function camposAlterados(
  atual: FichaAtual,
  linha: LinhaParaFicha,
): Partial<FichaAtual> {
  const d: Partial<FichaAtual> = {};
  if (linha.nome !== atual.nome) d.nome = linha.nome;
  if (linha.setorId !== atual.setorId) d.setorId = linha.setorId;
  if (linha.posicaoId !== atual.posicaoId) d.posicaoId = linha.posicaoId;
  const textos = ["cpf", "matricula", "email", "telefone", "dataAdmissao", "dataNascimento", "tipoContrato"] as const;
  for (const campo of textos) {
    const novo = linha[campo];
    if (novo && novo !== atual[campo]) d[campo] = novo;
  }
  if (linha.salarioBase !== null && salariosDiferentes(atual.salarioBase, linha.salarioBase)) {
    d.salarioBase = linha.salarioBase;
  }
  return d;
}

// ─── Teto de linhas por importação ─────────────────────────────────────────
//
// A importação grava numa transação só (tudo ou nada). Com o pré-carregamento e
// as gravações em lote, o custo que sobra é um UPDATE por colaborador que MUDA
// — e 20 mil deles não cabem com folga nos 60 s da transação. 5 mil cabem
// (pior caso, todas as linhas mudando, fica na casa de 15–20 s), e é mais do
// que o grupo inteiro tem de gente. Planilha maior: dividir em partes.
export const MAX_LINHAS_IMPORTACAO = 5_000;
