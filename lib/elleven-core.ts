// Lógica PURA e compartilhada da integração com o elleven (parse de datas/valores,
// categorização de serviços, matching de vendedores e agregação de contratos em
// um lançamento). Fica num módulo SEM "use server" para poder ser reutilizada
// tanto pelas Server Actions da UI (lib/actions/elleven.ts) quanto pela
// importação automática do cron (lib/importar-elleven-auto.ts) — garantindo uma
// ÚNICA fonte de verdade para a categorização, que define quanto cada vendedor
// recebe de bônus. Duplicar essa lógica poderia pagar bônus divergente entre os
// dois caminhos.

import { normalizarTexto } from "@/lib/text";

// Data de referência para agrupar por período: preferimos "Ativação Contrato"
// (a mesma data usada para filtrar o relatório no elleven — "Filtrar por: Data
// de Ativação"), caindo para "Data Contrato" quando a primeira estiver vazia. O
// regex extrai só a parte dd/mm/aaaa e ignora hora/resto.
export function parseDataBr(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Valores monetários do CSV do elleven vêm como texto (ex.: "1.234,56" ou
// "R$ 99,90").
export function parseValorBr(raw: string | null): number {
  if (!raw) return 0;
  const limpo = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

export type ProdutoKey =
  | "qtdInternet"
  | "qtdChip"
  | "qtdGps"
  | "qtdTv"
  | "qtdStreaming"
  | "qtdTelefoniaFixa";

// Ordem importa: categorias específicas são testadas ANTES de Internet, que é a
// mais abrangente (casa qualquer nome com padrão de banda \d+MB / \d+Mbps).
// Exceções vistas nos dados: "CDNTV ..." (streaming) e "Rastreamento Veicular"
// (GPS). "IP FIXO" e afins não batem em nada -> Outros.
export const PRODUTO_KEYWORDS: { key: ProdutoKey; regex: RegExp }[] = [
  { key: "qtdGps", regex: /gps|rastre/i },
  // TV por assinatura/linear. Testado ANTES de streaming: "cdntv" hoje casaria
  // streaming, então TV precisa de termos próprios. Best-effort.
  { key: "qtdTv", regex: /\btv\b|iptv|tv ?box|canais/i },
  {
    key: "qtdStreaming",
    regex: /cdntv|stream|hbo|netflix|paramount|telecine|max\b|filmes|s[ée]ries/i,
  },
  { key: "qtdChip", regex: /chip|sim ?card|m2m/i },
  { key: "qtdTelefoniaFixa", regex: /telefonia|voip|telefone/i },
  {
    // \d+MB / \d+Mbps seguido de não-letra — cobre "..._600MB_PROMO" e
    // "300MB_69,90", onde um \b falharia porque "_" é caractere de palavra.
    key: "qtdInternet",
    regex: /internet|banda[ _]?larga|fibra|\d+\s*mb(ps)?(?![a-z])/i,
  },
];

// Categoria de um "Serviço Ativado": uma das chaves de produto, ou null (=Outros).
export function categoriaProduto(servico: string | null): ProdutoKey | null {
  return PRODUTO_KEYWORDS.find((p) => p.regex.test(servico || ""))?.key ?? null;
}

// "Status Contrato" traz "Normal", "Cancelado", etc. Contrato cancelado não
// conta como venda aprovada nem gera bônus de produto/valor.
export function isCancelado(status: string | null): boolean {
  return /cancel/i.test(status || "");
}

// "Cidade" no elleven vem como "Guarabira - PB" — o sufixo de UF sai para casar
// com o cadastro de cidades (que guarda só o nome).
export function limparCidadeElleven(raw: string | null): string | null {
  const nome = (raw || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();
  return nome || null;
}

// Partículas que não ajudam a identificar a pessoa ("José DE Souza").
const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e"]);

export function tokensNome(nome: string): string[] {
  return normalizarTexto(nome)
    .split(" ")
    .filter((t) => t && !PARTICULAS.has(t));
}

// O elleven costuma registrar o nome completo ("JOÃO MARCELO FERNANDES DA
// SILVA") enquanto o cadastro tem a forma curta ("JOÃO MARCELO FERNANDES").
// Consideramos "provável mesma pessoa" quando todos os tokens do nome mais curto
// aparecem, na mesma ordem, no nome mais longo.
export function tokensContidosEmOrdem(menor: string[], maior: string[]): boolean {
  if (menor.length < 2) return false;
  let i = 0;
  for (const t of maior) {
    if (t === menor[i]) i++;
    if (i === menor.length) return true;
  }
  return false;
}

// Campos numéricos agregados de um conjunto de contratos de um vendedor —
// o formato exato de um LancamentoVenda (menos identidade/período).
export type AgregadoElleven = {
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  valorDemaisServicos: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdTv: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
  qtdOutros: number;
};

export type ContratoParaAgregar = {
  statusContrato: string | null;
  valServAtivado: string | null;
  servicoAtivado: string | null;
};

export function agregadoVazio(): AgregadoElleven {
  return {
    quantidade: 0,
    aprovado: 0,
    cancelado: 0,
    valorInstalado: 0,
    valorDemaisServicos: 0,
    qtdInternet: 0,
    qtdChip: 0,
    qtdGps: 0,
    qtdTv: 0,
    qtdStreaming: 0,
    qtdTelefoniaFixa: 0,
    qtdOutros: 0,
  };
}

// Agrega uma lista de contratos de um mesmo vendedor num único lançamento.
// Regras (idênticas ao preview manual): cancelado só conta como cancelado;
// aprovado soma valor instalado e a categoria do serviço; valorDemaisServicos é
// o valor de todo serviço NÃO-internet (base da regra de 50% do Atendimento).
export function agregarContratos(contratos: ContratoParaAgregar[]): AgregadoElleven {
  const ag = agregadoVazio();
  ag.quantidade = contratos.length;
  for (const c of contratos) {
    if (isCancelado(c.statusContrato)) {
      ag.cancelado++;
      continue;
    }
    ag.aprovado++;
    const valor = parseValorBr(c.valServAtivado);
    ag.valorInstalado += valor;
    const cat = categoriaProduto(c.servicoAtivado);
    if (cat) ag[cat]++;
    else ag.qtdOutros++;
    if (cat !== "qtdInternet") ag.valorDemaisServicos += valor;
  }
  return ag;
}

export type ModoMatch = "EXATO" | "FUZZY" | null;

// Casa um nome de vendedor do elleven com um funcionário cadastrado: primeiro
// por nome exato (normalizado), depois pelo heurístico de tokens em ordem.
export function acharFuncionario<T extends { id: string; nome: string }>(
  nomeElleven: string,
  funcionarios: T[],
  porNomeExato: Map<string, T>,
): { funcionario: T | null; modo: ModoMatch } {
  const exato = porNomeExato.get(normalizarTexto(nomeElleven));
  if (exato) return { funcionario: exato, modo: "EXATO" };

  const tokensElleven = tokensNome(nomeElleven);
  let melhor: T | null = null;
  let melhorScore = 0;
  for (const f of funcionarios) {
    const tokensCadastro = tokensNome(f.nome);
    const [menor, maior] =
      tokensCadastro.length <= tokensElleven.length
        ? [tokensCadastro, tokensElleven]
        : [tokensElleven, tokensCadastro];
    if (tokensContidosEmOrdem(menor, maior) && menor.length > melhorScore) {
      melhorScore = menor.length;
      melhor = f;
    }
  }
  return { funcionario: melhor, modo: melhor ? "FUZZY" : null };
}
