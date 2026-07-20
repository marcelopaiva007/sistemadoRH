"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { normalizarTexto } from "@/lib/text";
// Parsing/categorização/matching vivem em lib/elleven-core.ts (fonte única,
// compartilhada com a importação automática do cron) — ver comentário lá.
import {
  parseDataBr,
  parseValorBr,
  PRODUTO_KEYWORDS,
  isCancelado,
  limparCidadeElleven,
  tokensNome,
  tokensContidosEmOrdem,
} from "@/lib/elleven-core";

export type LinhaPreviewElleven = {
  vendedorOriginal: string;
  funcionarioId: string;
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
      valorDemaisServicos: 0,
      qtdInternet: 0,
      qtdChip: 0,
      qtdGps: 0,
      qtdTv: 0,
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
      const valorServico = parseValorBr(c.valServAtivado);
      linha.valorInstalado += valorServico;
      const servico = c.servicoAtivado || "";
      const found = PRODUTO_KEYWORDS.find((p) => p.regex.test(servico));
      // Os produtos acima são a lista fechada; qualquer serviço que não bata
      // com nenhum deles entra em "Outros" (conta na quantidade, mas não gera
      // bônus de produto — não há regra para "Outros").
      if (found) linha[found.key]++;
      else linha.qtdOutros++;
      // Base dos 50% do Atendimento/ADM: valor de todo serviço não-internet.
      if (found?.key !== "qtdInternet") linha.valorDemaisServicos += valorServico;
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
