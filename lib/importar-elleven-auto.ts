// Importação AUTOMÁTICA dos contratos do elleven em LancamentoVenda.
//
// Roda a partir do cron (sync-elleven), sem usuário logado — por isso vive num
// módulo plano (sem "use server") e NÃO cria ImportLote (que exige usuarioId).
// É idempotente: a cada rodada substitui apenas os lançamentos que ela mesma
// gerou (origem "ELLEVEN_AUTO"), nunca tocando em lançamentos MANUAL/HISTORICO
// ou importados pela tela. Vendedor do elleven sem cadastro é criado
// automaticamente como VENDEDOR_EXTERNO (decisão do cliente na OS), para que
// nenhuma venda fique de fora do relatório do mês corrente.

import { prisma } from "@/lib/prisma";
import { normalizarTexto } from "@/lib/text";
import { recalcularFechamento } from "@/lib/bonificacao";
import {
  acharFuncionario,
  agregarContratos,
  limparCidadeElleven,
  parseDataBr,
} from "@/lib/elleven-core";

export const ORIGEM_ELLEVEN_AUTO = "ELLEVEN_AUTO";

export type ResultadoImportacaoAuto = {
  periodo: string;
  contratosNoPeriodo: number;
  contratosSemVendedor: number;
  vendedores: number;
  lancamentosGerados: number;
  matchExato: number;
  matchFuzzy: number;
  funcionariosCriados: number;
};

// Importa os contratos do `periodo` (formato "AAAA-MM") em lançamentos e
// recalcula o fechamento (mantido ABERTO). Seguro para rodar várias vezes.
export async function importarLancamentosEllevenAuto(
  periodo: string,
): Promise<ResultadoImportacaoAuto> {
  const [ano, mes] = periodo.split("-").map(Number);

  const contratos = await prisma.contratoAtivacaoElleven.findMany();
  const doPeriodo = contratos.filter((c) => {
    const d = parseDataBr(c.ativacaoContrato) ?? parseDataBr(c.dataContrato);
    return d && d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes;
  });

  // Agrupa por vendedor. Contrato sem vendedor não pode ser atribuído a ninguém
  // (não dá para criar um funcionário sem nome) — fica de fora e é reportado.
  type Grupo = { contratos: typeof doPeriodo; cidades: Map<string, number> };
  const porVendedor = new Map<string, Grupo>();
  let contratosSemVendedor = 0;
  for (const c of doPeriodo) {
    const nome = (c.vendedor1 || "").trim();
    if (!nome) {
      contratosSemVendedor++;
      continue;
    }
    const g: Grupo = porVendedor.get(nome) ?? { contratos: [], cidades: new Map() };
    g.contratos.push(c);
    const cidade = limparCidadeElleven(c.cidade);
    if (cidade) g.cidades.set(cidade, (g.cidades.get(cidade) ?? 0) + 1);
    porVendedor.set(nome, g);
  }

  const funcionarios = await prisma.funcionario.findMany({ where: { ativo: true } });
  const porNomeExato = new Map(funcionarios.map((f) => [normalizarTexto(f.nome), f]));

  // Cache de cidades para resolver/criar sob demanda (nome é único).
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

  const resultado: ResultadoImportacaoAuto = {
    periodo,
    contratosNoPeriodo: doPeriodo.length,
    contratosSemVendedor,
    vendedores: porVendedor.size,
    lancamentosGerados: 0,
    matchExato: 0,
    matchFuzzy: 0,
    funcionariosCriados: 0,
  };

  // Resolve o funcionário de cada vendedor: exato -> fuzzy -> criar novo. A
  // criação acontece aqui (fora da transação de lançamentos) para manter a
  // transação curta; funcionários órfãos criados numa rodada que falhe depois
  // são inofensivos (ficam disponíveis para a próxima).
  const linhas: {
    funcionarioId: string;
    ag: ReturnType<typeof agregarContratos>;
  }[] = [];
  for (const [nomeElleven, grupo] of porVendedor) {
    const { funcionario, modo } = acharFuncionario(nomeElleven, funcionarios, porNomeExato);
    let funcionarioId: string;
    if (funcionario) {
      funcionarioId = funcionario.id;
      if (modo === "EXATO") resultado.matchExato++;
      else resultado.matchFuzzy++;
    } else {
      const cidadePredominante =
        [...grupo.cidades.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const cidadeId = await resolverCidadeId(cidadePredominante);
      const novo = await prisma.funcionario.create({
        data: { nome: nomeElleven, cargo: "VENDEDOR_EXTERNO", cidadeId, ativo: true },
      });
      funcionarioId = novo.id;
      resultado.funcionariosCriados++;
      // Deixa disponível para casar com outros vendedores/rodadas nesta execução.
      funcionarios.push(novo);
      porNomeExato.set(normalizarTexto(novo.nome), novo);
    }
    linhas.push({ funcionarioId, ag: agregarContratos(grupo.contratos) });
  }

  // Substitui, atomicamente, os lançamentos automáticos deste período.
  await prisma.$transaction(async (tx) => {
    await tx.lancamentoVenda.deleteMany({
      where: { periodo, origem: ORIGEM_ELLEVEN_AUTO },
    });
    if (linhas.length > 0) {
      await tx.lancamentoVenda.createMany({
        data: linhas.map(({ funcionarioId, ag }) => ({
          funcionarioId,
          periodo,
          quantidade: ag.quantidade,
          aprovado: ag.aprovado,
          cancelado: ag.cancelado,
          valorInstalado: ag.valorInstalado,
          valorDemaisServicos: ag.valorDemaisServicos,
          qtdInternet: ag.qtdInternet,
          qtdChip: ag.qtdChip,
          qtdGps: ag.qtdGps,
          qtdTv: ag.qtdTv,
          qtdStreaming: ag.qtdStreaming,
          qtdTelefoniaFixa: ag.qtdTelefoniaFixa,
          origem: ORIGEM_ELLEVEN_AUTO,
        })),
      });
    }
  });
  resultado.lancamentosGerados = linhas.length;

  // Recalcula a bonificação do mês, mantendo o fechamento ABERTO até o
  // fechamento manual pela diretoria.
  await recalcularFechamento(periodo);

  return resultado;
}
