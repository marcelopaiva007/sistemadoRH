"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { normalizarTexto } from "@/lib/text";

// Data de referência para agrupar por período: preferimos "Ativação Contrato"
// (a mesma data usada para filtrar o relatório no elleven — "Filtrar por:
// Data de Ativação"), caindo para "Data Contrato" quando a primeira estiver
// vazia. Formato ainda não 100% confirmado (esperado dd/mm/aaaa, possivelmente
// com hora) — regex extrai só a parte dd/mm/aaaa e ignora o resto.
function parseDataBr(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Valores monetários do CSV do elleven vêm como texto (ex.: "1.234,56" ou
// "R$ 99,90") — best-effort, não confirmado com dado real ainda.
function parseValorBr(raw: string | null): number {
  if (!raw) return 0;
  const limpo = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? 0 : n;
}

const PRODUTO_KEYWORDS = [
  { key: "qtdInternet" as const, regex: /internet|banda ?larga|fibra/i },
  { key: "qtdChip" as const, regex: /chip|sim ?card|m2m/i },
  { key: "qtdGps" as const, regex: /gps|rastre/i },
  { key: "qtdStreaming" as const, regex: /stream|hbo|netflix|paramount|telecine|max\b/i },
  { key: "qtdTelefoniaFixa" as const, regex: /telefonia|voip|fixo|fixa/i },
];

export type LinhaPreviewElleven = {
  vendedorOriginal: string;
  funcionarioId: string;
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
  qtdSemProdutoReconhecido: number;
  contratos: string[];
};

export async function previsualizarLancamentosElleven(periodo: string) {
  await requireAdmin();

  const [ano, mes] = periodo.split("-").map(Number);

  // Dataset de um único ISP: volume esperado é baixo o bastante para filtrar
  // em memória em vez de tentar casar um padrão de data guardado como texto
  // livre via SQL.
  const contratos = await prisma.contratoAtivacaoElleven.findMany();

  const doPeriodo = contratos.filter((c) => {
    const d = parseDataBr(c.ativacaoContrato) ?? parseDataBr(c.dataContrato);
    return d && d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes;
  });

  const funcionarios = await prisma.funcionario.findMany({ where: { ativo: true } });
  const porNome = new Map(funcionarios.map((f) => [normalizarTexto(f.nome), f]));

  const porVendedor = new Map<string, typeof doPeriodo>();
  for (const c of doPeriodo) {
    const nome = (c.vendedor1 || "").trim() || "(sem vendedor no contrato)";
    const lista = porVendedor.get(nome) ?? [];
    lista.push(c);
    porVendedor.set(nome, lista);
  }

  const linhas: LinhaPreviewElleven[] = [];
  for (const [vendedorOriginal, lista] of porVendedor) {
    const match = porNome.get(normalizarTexto(vendedorOriginal));
    const linha: LinhaPreviewElleven = {
      vendedorOriginal,
      funcionarioId: match?.id ?? "",
      quantidade: lista.length,
      // O relatório "Ativação Contratos" já lista contratos ativados — não há
      // status de cancelamento nesta consulta específica, por isso tratamos
      // tudo como aprovado. Ajuste manual continua possível depois de importar.
      aprovado: lista.length,
      cancelado: 0,
      valorInstalado: 0,
      qtdInternet: 0,
      qtdChip: 0,
      qtdGps: 0,
      qtdStreaming: 0,
      qtdTelefoniaFixa: 0,
      qtdSemProdutoReconhecido: 0,
      contratos: lista.map((c) => c.contrato),
    };
    for (const c of lista) {
      linha.valorInstalado += parseValorBr(c.valServAtivado);
      const servico = c.servicoAtivado || "";
      const found = PRODUTO_KEYWORDS.find((p) => p.regex.test(servico));
      if (found) linha[found.key]++;
      else linha.qtdSemProdutoReconhecido++;
    }
    linhas.push(linha);
  }

  linhas.sort((a, b) => b.quantidade - a.quantidade);

  return {
    linhas,
    totalContratosNoPeriodo: doPeriodo.length,
    totalContratosGeral: contratos.length,
  };
}
