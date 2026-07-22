"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { normalizarTexto } from "@/lib/text";
import { tokensContidosEmOrdem, tokensNome } from "@/lib/vendedor-match";

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

// Ordem importa: as categorias específicas são testadas ANTES de Internet, que
// é a mais abrangente. Confirmado com dados reais do elleven: quase todo
// "Serviço Ativado" é um plano de internet nomeado com a velocidade (ex.:
// "PLANO_PROMOCIONAL_JULHO_600MB", "GBA_FAMILIA_400MB", "AREIAL_200MB"), então
// Internet também casa qualquer nome com padrão de banda (\d+MB / \d+Mbps).
// Exceções vistas nos dados: "CDNTV ..." (streaming) e "Rastreamento Veicular"
// (GPS). "IP FIXO" e afins não batem em nada -> Outros.
const PRODUTO_KEYWORDS = [
  { key: "qtdGps" as const, regex: /gps|rastre/i },
  {
    key: "qtdStreaming" as const,
    regex: /cdntv|stream|hbo|netflix|paramount|telecine|max\b|filmes|s[ée]ries/i,
  },
  { key: "qtdChip" as const, regex: /chip|sim ?card|m2m/i },
  { key: "qtdTelefoniaFixa" as const, regex: /telefonia|voip|telefone/i },
  {
    // \d+MB / \d+Mbps seguido de qualquer coisa que não seja letra (fim, "_",
    // espaço, hífen) — cobre nomes como "..._600MB_PROMO" e "300MB_69,90", onde
    // um \b falharia porque "_" também é caractere de palavra.
    key: "qtdInternet" as const,
    regex: /internet|banda[ _]?larga|fibra|\d+\s*mb(ps)?(?![a-z])/i,
  },
];

// "Status Contrato" no CSV traz "Normal", "Cancelado", etc. Contrato cancelado
// não conta como venda aprovada nem gera bônus de produto/valor.
function isCancelado(status: string | null): boolean {
  return /cancel/i.test(status || "");
}

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
  qtdOutros: number;
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
      aprovado: 0,
      cancelado: 0,
      valorInstalado: 0,
      qtdInternet: 0,
      qtdChip: 0,
      qtdGps: 0,
      qtdStreaming: 0,
      qtdTelefoniaFixa: 0,
      qtdOutros: 0,
      contratos: lista.map((c) => c.contrato),
    };
    for (const c of lista) {
      // Contrato cancelado conta só como cancelado — não entra em aprovado,
      // valor instalado nem categoria de produto (que geram bonificação).
      if (isCancelado(c.statusContrato)) {
        linha.cancelado++;
        continue;
      }
      linha.aprovado++;
      linha.valorInstalado += parseValorBr(c.valServAtivado);
      const servico = c.servicoAtivado || "";
      const found = PRODUTO_KEYWORDS.find((p) => p.regex.test(servico));
      // Os 5 produtos acima são a lista fechada; qualquer serviço que não bata
      // com nenhum deles entra em "Outros" (conta na quantidade, mas não gera
      // bônus de produto — não há regra para "Outros").
      if (found) linha[found.key]++;
      else linha.qtdOutros++;
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

// ---------- Sincronização do cadastro de vendedores a partir do elleven ----------

// "Cidade" no elleven vem como "Guarabira - PB" — o sufixo de UF sai para
// casar com o cadastro de cidades do sistema (que guarda só o nome).
function limparCidadeElleven(raw: string | null): string | null {
  const nome = (raw || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();
  return nome || null;
}

// Helpers de casamento de nomes movidos para lib/vendedor-match.ts (comparti-
// lhados com a importação de chips do L&M Movel).

export type SituacaoVendedorElleven = "OK" | "RENOMEAR" | "NOVO";

export type VendedorEllevenPreview = {
  nomeElleven: string;
  contratos: number;
  ultimaAtividade: string | null;
  cidadeElleven: string | null;
  situacao: SituacaoVendedorElleven;
  funcionarioSugeridoId: string | null;
  funcionarioSugeridoNome: string | null;
  funcionarioSemCidade: boolean;
};

export async function previsualizarVendedoresElleven() {
  await requireAdmin();

  const [contratos, funcionarios] = await Promise.all([
    prisma.contratoAtivacaoElleven.findMany(),
    prisma.funcionario.findMany({ include: { cidade: true } }),
  ]);

  type Grupo = { contratos: number; cidades: Map<string, number>; ultima: Date | null };
  const porVendedor = new Map<string, Grupo>();
  for (const c of contratos) {
    const nome = (c.vendedor1 || "").trim();
    if (!nome) continue;
    const g = porVendedor.get(nome) ?? { contratos: 0, cidades: new Map(), ultima: null };
    g.contratos++;
    const cidade = limparCidadeElleven(c.cidade);
    if (cidade) g.cidades.set(cidade, (g.cidades.get(cidade) ?? 0) + 1);
    const d = parseDataBr(c.ativacaoContrato) ?? parseDataBr(c.dataContrato);
    if (d && (!g.ultima || d > g.ultima)) g.ultima = d;
    porVendedor.set(nome, g);
  }

  const porNomeExato = new Map(funcionarios.map((f) => [normalizarTexto(f.nome), f]));

  const vendedores: VendedorEllevenPreview[] = [];
  for (const [nomeElleven, g] of porVendedor) {
    const cidadeElleven =
      [...g.cidades.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    let situacao: SituacaoVendedorElleven = "NOVO";
    let sugerido = porNomeExato.get(normalizarTexto(nomeElleven)) ?? null;
    if (sugerido) {
      situacao = "OK";
    } else {
      const tokensElleven = tokensNome(nomeElleven);
      let melhorScore = 0;
      for (const f of funcionarios) {
        const tokensCadastro = tokensNome(f.nome);
        const [menor, maior] =
          tokensCadastro.length <= tokensElleven.length
            ? [tokensCadastro, tokensElleven]
            : [tokensElleven, tokensCadastro];
        if (tokensContidosEmOrdem(menor, maior) && menor.length > melhorScore) {
          melhorScore = menor.length;
          sugerido = f;
        }
      }
      if (sugerido) situacao = "RENOMEAR";
    }

    vendedores.push({
      nomeElleven,
      contratos: g.contratos,
      ultimaAtividade: g.ultima
        ? g.ultima.toLocaleDateString("pt-BR", { timeZone: "UTC" })
        : null,
      cidadeElleven,
      situacao,
      funcionarioSugeridoId: sugerido?.id ?? null,
      funcionarioSugeridoNome: sugerido?.nome ?? null,
      funcionarioSemCidade: sugerido ? !sugerido.cidadeId : false,
    });
  }

  const peso: Record<SituacaoVendedorElleven, number> = { NOVO: 0, RENOMEAR: 1, OK: 2 };
  vendedores.sort(
    (a, b) => peso[a.situacao] - peso[b.situacao] || b.contratos - a.contratos
  );

  return { vendedores, totalContratos: contratos.length };
}

const decisaoSchema = z.object({
  nomeElleven: z.string().trim().min(2),
  // null/"" => criar um funcionário novo com o nome do elleven.
  funcionarioId: z.string().trim().nullable(),
  cidadeElleven: z.string().trim().nullable(),
});

export type DecisaoVendedorElleven = z.infer<typeof decisaoSchema>;

export async function sincronizarVendedoresElleven(decisoes: DecisaoVendedorElleven[]) {
  await requireAdmin();

  const parsed = z.array(decisaoSchema).max(500).safeParse(decisoes);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const cidades = await prisma.cidade.findMany();
  const cidadePorNome = new Map(cidades.map((c) => [normalizarTexto(c.nome), c]));

  async function resolverCidadeId(nome: string | null): Promise<string | null> {
    if (!nome) return null;
    const existente = cidadePorNome.get(normalizarTexto(nome));
    if (existente) return existente.id;
    const criada = await prisma.cidade.create({ data: { nome } });
    cidadePorNome.set(normalizarTexto(nome), criada);
    return criada.id;
  }

  let criados = 0;
  let renomeados = 0;
  let cidadesDefinidas = 0;

  for (const d of parsed.data) {
    const cidadeId = await resolverCidadeId(d.cidadeElleven);

    if (d.funcionarioId) {
      const funcionario = await prisma.funcionario.findUnique({
        where: { id: d.funcionarioId },
      });
      if (!funcionario) continue;
      const data: { nome?: string; cidadeId?: string } = {};
      if (funcionario.nome !== d.nomeElleven) {
        data.nome = d.nomeElleven;
        renomeados++;
      }
      if (!funcionario.cidadeId && cidadeId) {
        data.cidadeId = cidadeId;
        cidadesDefinidas++;
      }
      if (Object.keys(data).length > 0) {
        await prisma.funcionario.update({ where: { id: funcionario.id }, data });
      }
    } else {
      await prisma.funcionario.create({
        data: {
          nome: d.nomeElleven,
          cargo: "VENDEDOR_EXTERNO",
          cidadeId,
          ativo: true,
        },
      });
      criados++;
    }
  }

  revalidatePath("/cadastros/funcionarios");
  revalidatePath("/cadastros/cidades");
  return { ok: true as const, criados, renomeados, cidadesDefinidas };
}
