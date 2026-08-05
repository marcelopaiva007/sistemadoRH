import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { formatarData, hojeUTC } from "@/lib/datas";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  distribuicaoFaixaEtaria,
  headcountMensal,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { analisarDesligamentos, type Anomalia, type VinculoParaAnomalia } from "@/lib/anomalias";
import { resumoTempoDeCasa, tempoDeCasaPorSetor } from "@/lib/tempo-de-casa";
import { PainelView } from "./painel-view";
import type { AbsenteismoNaTela, LinhaCustoNaTela } from "./painel-view";
import type { AnomaliaNaTela, SaidaDoMes } from "./radar-desvio";

/**
 * Painel — a tela única de BI de RH (Painel + Indicadores fundidos).
 *
 * As duas telas liam a MESMA `lib/bi.ts`, com o mesmo escopo e a mesma janela
 * fixa de 12 meses: uma desenhava, a outra tabelava. Viraram uma tela com um
 * alternador. A rota `indicadores/` deixou de existir; as rotas de exportação
 * (`/api/rh/[empresaId]/indicadores/csv` e `.../relatorio-pdf`) continuam de pé
 * e continuam sendo chamadas daqui.
 *
 * Três mudanças de comportamento em relação ao que existia:
 *
 * 1. Escopo. Era `empresasDaMesmaMarca(empresaId)` — sempre a marca do CNPJ da
 *    rota, sem escolha. Agora é `empresasVisiveis(usuario)` cruzado com o
 *    filtro `?empresas=` que a árvore da lateral já escreve na URL. Para
 *    ADMIN/DIRETORIA o padrão passa a ser o grupo inteiro, e dá para descer ao
 *    CNPJ sem trocar de tela.
 * 2. Janela. Era 12 meses cravados no código; agora 3/6/12/24 pela URL. Vale
 *    para turnover, movimentação e evolução do quadro — NÃO para o radar de
 *    desvio, que precisa de 12 meses de baseline mais os meses avaliados e por
 *    isso roda sempre em 24 (com uma série de 12, o baseline come tudo e nenhum
 *    mês seria avaliado).
 * 3. Absenteísmo. A tabela antiga calculava taxa em cima de uma tabela
 *    `Ausencia` vazia e imprimia 0,0% por setor. A contagem crua de registros
 *    agora vem junto e decide o que a tela mostra — ver `AbsenteismoNaTela`.
 */

const JANELAS = [3, 6, 12, 24];
const JANELA_PADRAO = 12;

/**
 * O radar sempre varre 24 meses, independente da janela escolhida na tela.
 * `lib/anomalias.ts` gasta 12 meses só montando o baseline de cada unidade; uma
 * série de 12 não avaliaria mês nenhum e o bloco viveria vazio sem nunca dizer
 * que não testou nada.
 */
const MESES_DO_RADAR = 24;

/**
 * Abaixo desta cobertura de salário a soma deixa de descrever o grupo.
 *
 * Mesmo corte e mesmo motivo do Placar: a Centrysol tem 1 salário em 39 ativos,
 * e somar dá R$ 1.621 — um número que parece real e descreve 2,5% do quadro.
 * Testar `soma === 0` não pega esse caso; o corte é por COBERTURA. A constante
 * está repetida aqui, e não importada de `placar/page.tsx`, porque aquele
 * arquivo é uma página (importar dele arrastaria a rota inteira). Se um terceiro
 * consumidor aparecer, o certo é extrair para `lib/`.
 */
const COBERTURA_MINIMA_FOLHA = 0.5;

/** Janela em que o absenteísmo é medido — a mesma de `absenteismoPorSetor`. */
const JANELA_ABSENTEISMO_DIAS = 30;

export default async function PainelPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; janela?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, janela: janelaParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);

  // Mesma regra de `filtro-empresas.tsx::useFiltroEmpresas`: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — um id digitado à mão
  // não vira acesso. A regra está escrita aqui porque aquele módulo é "use
  // client" e importá-lo de um Server Component traz uma referência de cliente,
  // não a função. Se ela mudar lá, precisa mudar aqui (e no Placar, que tem a
  // mesma cópia).
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter(id => visiveis.includes(id));

  const janela = JANELAS.includes(Number(janelaParam)) ? Number(janelaParam) : JANELA_PADRAO;
  const hoje = hojeUTC();

  const [
    empresas,
    vinculos,
    ativos,
    setores,
    ausenciasRecentes,
    ausenciasNoEscopo,
    beneficiosVigentes,
  ] = await Promise.all([
    // Todas as visíveis, não só as do escopo: os seletores de marca e CNPJ
    // precisam oferecer o que está fora do filtro atual, senão filtrar em um
    // CNPJ tranca a pessoa nele.
    prisma.empresa.findMany({
      where: { id: { in: visiveis }, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, marca: { select: { id: true, nome: true } } },
    }),
    // `select` explícito, e aqui ele decide privacidade de verdade: `nome`,
    // `setor` e `posicao` existem nesta consulta só para montar a lista nominal
    // das anomalias, e apenas os desligados DOS MESES QUE ALERTARAM chegam ao
    // Client Component. Nenhum salário, documento ou dado bancário entra —
    // salário é lido na consulta de ativos abaixo e nunca sai de agregado.
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo } },
      select: {
        id: true,
        nome: true,
        ativo: true,
        empresaId: true,
        dataAdmissao: true,
        dataDesligamento: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, ativo: true },
      select: {
        salarioBase: true,
        dataAdmissao: true,
        dataNascimento: true,
        setorId: true,
        setor: { select: { nome: true } },
      },
    }),
    // O cadastro de setores é por CNPJ (48 linhas para 15 nomes no grupo);
    // `tempoDeCasaPorSetor` resolve o nome por aqui e junta as grafias.
    prisma.setor.findMany({
      where: { empresaId: { in: escopo } },
      select: { id: true, nome: true },
    }),
    prisma.ausencia.findMany({
      where: {
        empresaId: { in: escopo },
        dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) },
      },
      select: {
        dias: true,
        abonada: true,
        dataInicio: true,
        colaborador: { select: { setor: { select: { nome: true } } } },
      },
    }),
    // Contagem CRUA, sem recorte de data: é ela que distingue "ninguém faltou"
    // de "o módulo nunca foi usado". Medida, nunca presumida — no dia em que o
    // RH lançar a primeira ausência, o bloco muda sozinho.
    prisma.ausencia.count({ where: { empresaId: { in: escopo } } }),
    prisma.beneficioColaborador.findMany({
      where: {
        empresaId: { in: escopo },
        OR: [{ dataFim: null }, { dataFim: { gte: hoje } }],
        colaborador: { ativo: true },
      },
      select: {
        valorEmpresa: true,
        colaborador: { select: { setor: { select: { nome: true } } } },
      },
    }),
  ]);

  const porEmpresa = new Map(empresas.map(e => [e.id, e]));

  // --- Números de sempre (lib/bi.ts), agora na janela escolhida -------------
  const headcount = headcountPorSetor(ativos.map(c => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(vinculos, ativos.length, hoje, janela);
  const movimento = movimentoMensal(vinculos, hoje, janela);
  const evolucao = headcountMensal(vinculos, ativos.length, hoje, janela);
  const faixaEtaria = distribuicaoFaixaEtaria(
    ativos.map(c => ({ dataNascimento: c.dataNascimento })),
    hoje
  );

  // --- Tempo de casa: distribuição no lugar da média solta ------------------
  const tempo = resumoTempoDeCasa(ativos, hoje);
  const tempoPorSetor = tempoDeCasaPorSetor(ativos, setores, hoje);

  // --- Radar de desvio ------------------------------------------------------
  const vinculosParaAnomalia: VinculoParaAnomalia[] = vinculos.flatMap(v => {
    const e = porEmpresa.get(v.empresaId);
    // Empresa fora de `visiveis` não deveria aparecer (o escopo sai dela), mas
    // um CNPJ desativado entre a consulta e o filtro cairia aqui. Descartar é
    // melhor do que inventar uma unidade "empresa desconhecida" no radar.
    if (!e) return [];
    return [
      {
        empresaId: e.id,
        empresaNome: e.nome,
        marcaId: e.marca.id,
        marcaNome: e.marca.nome,
        ativo: v.ativo,
        dataDesligamento: v.dataDesligamento,
      },
    ];
  });
  const resultado = analisarDesligamentos(vinculosParaAnomalia, hoje, MESES_DO_RADAR);

  // A lista nominal é montada DEPOIS do teste, só para os meses que alertaram:
  // é o que mantém o payload do cliente em algumas dezenas de nomes em vez dos
  // 352 vínculos do recorte.
  const anomalias: AnomaliaNaTela[] = resultado.anomalias.map(a => ({
    frase: a.frase,
    mes: a.mes,
    nivel: a.nivel,
    unidadeId: a.unidadeId,
    unidadeNome: a.unidadeNome,
    observado: a.observado,
    esperado: a.esperado,
    p: a.p,
    mesesDeBaseline: a.mesesDeBaseline,
    mesIncompleto: a.mesIncompleto,
    saidas: saidasDaAnomalia(vinculos, porEmpresa, a),
  }));

  // --- Folha: soma só onde a cobertura sustenta ----------------------------
  const comSalario = ativos.filter(c => c.salarioBase != null).length;
  const custoBase = custoPessoalPorSetor(
    ativos.map(c => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map(b => ({
      setorNome: b.colaborador.setor.nome,
      valorEmpresa: b.valorEmpresa,
    }))
  );
  const coberturaPorSetor = new Map<string, { ativos: number; comSalario: number }>();
  for (const c of ativos) {
    const atual = coberturaPorSetor.get(c.setor.nome) ?? { ativos: 0, comSalario: 0 };
    atual.ativos++;
    if (c.salarioBase != null) atual.comSalario++;
    coberturaPorSetor.set(c.setor.nome, atual);
  }
  const custo: LinhaCustoNaTela[] = custoBase.map(linha => {
    const cobertura = coberturaPorSetor.get(linha.setor) ?? { ativos: 0, comSalario: 0 };
    return {
      ...linha,
      ativos: cobertura.ativos,
      comSalario: cobertura.comSalario,
      folhaConfiavel:
        cobertura.ativos > 0 && cobertura.comSalario / cobertura.ativos >= COBERTURA_MINIMA_FOLHA,
    };
  });
  // Somada à mão em vez de reaproveitar `custoBase`: aquela função faz
  // `salarioBase ?? 0`, e o total precisa saber quantos entraram na conta para
  // decidir entre um número e "sem dado".
  const folhaTotal =
    ativos.length > 0 && comSalario / ativos.length >= COBERTURA_MINIMA_FOLHA
      ? ativos.reduce((t, c) => t + (c.salarioBase ?? 0), 0)
      : null;
  const beneficiosTotal = beneficiosVigentes.reduce((t, b) => t + (b.valorEmpresa ?? 0), 0);

  // --- Absenteísmo: três estados, decididos pela contagem crua -------------
  const absenteismo: AbsenteismoNaTela = {
    registrosNoEscopo: ausenciasNoEscopo,
    registrosNaJanela: ausenciasRecentes.filter(
      a =>
        a.dataInicio <= hoje &&
        hoje.getTime() - a.dataInicio.getTime() <= JANELA_ABSENTEISMO_DIAS * 86_400_000
    ).length,
    linhas: absenteismoPorSetor(
      ausenciasRecentes.map(a => ({
        setorNome: a.colaborador.setor.nome,
        dias: a.dias,
        abonada: a.abonada,
        dataInicio: a.dataInicio,
      })),
      headcount,
      hoje
    ),
  };

  // --- Exportação: as rotas de CSV/PDF não conhecem filtro nem janela ------
  const marcaDaRota = porEmpresa.get(empresaId)?.marca.id ?? null;
  const idsDaMarca = empresas.filter(e => e.marca.id === marcaDaRota).map(e => e.id);
  const exportacaoSegueATela =
    janela === JANELA_PADRAO &&
    idsDaMarca.length === escopo.length &&
    idsDaMarca.every(id => escopo.includes(id));

  return (
    <PainelView
      empresaId={empresaId}
      janela={janela}
      janelas={JANELAS}
      empresasDisponiveis={empresas.map(e => ({ id: e.id, nome: e.nome, marca: e.marca.nome }))}
      empresasSelecionadas={escopo}
      totalAtivos={ativos.length}
      turnover={turnover}
      movimento={movimento}
      evolucao={evolucao}
      headcount={headcount}
      faixaEtaria={faixaEtaria}
      custo={custo}
      folhaTotal={folhaTotal}
      beneficiosTotal={beneficiosTotal}
      comSalario={comSalario}
      radar={{
        anomalias,
        unidadesAvaliadas: resultado.unidadesAvaliadas,
        mesesAvaliadosPorUnidade: resultado.mesesAvaliadosPorUnidade,
        mesesDaSerie: MESES_DO_RADAR,
        avisos: resultado.avisos,
      }}
      tempo={tempo}
      tempoPorSetor={tempoPorSetor}
      absenteismo={absenteismo}
      exportacaoSegueATela={exportacaoSegueATela}
    />
  );
}

// ---------------------------------------------------------------
// Lista nominal do radar
// ---------------------------------------------------------------

type VinculoCarregado = {
  id: string;
  nome: string;
  ativo: boolean;
  empresaId: string;
  dataDesligamento: Date | null;
  setor: { nome: string };
  posicao: { nome: string };
};

type EmpresaCarregada = { id: string; nome: string; marca: { id: string; nome: string } };

/** "MM/AAAA" — a mesma chave de mês que `lib/anomalias.ts` usa na série. */
function chaveDoMes(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Quem saiu no mês da anomalia, dentro da unidade que alertou.
 *
 * O nível da unidade decide o recorte: "grupo" pega o recorte inteiro, "marca"
 * filtra pela marca do CNPJ de cada pessoa, "empresa" pelo CNPJ. Junho/2026
 * alerta nos três níveis de propósito (é a mesma história em três zooms), e a
 * lista de cada linha precisa bater com o número da própria linha.
 */
function saidasDaAnomalia(
  vinculos: VinculoCarregado[],
  porEmpresa: Map<string, EmpresaCarregada>,
  anomalia: Anomalia
): SaidaDoMes[] {
  return vinculos
    .filter(v => {
      if (v.ativo || !v.dataDesligamento) return false;
      if (chaveDoMes(v.dataDesligamento) !== anomalia.mes) return false;
      const empresa = porEmpresa.get(v.empresaId);
      if (!empresa) return false;
      if (anomalia.nivel === "empresa") return empresa.id === anomalia.unidadeId;
      if (anomalia.nivel === "marca") return empresa.marca.id === anomalia.unidadeId;
      return true;
    })
    .sort((a, b) => a.dataDesligamento!.getTime() - b.dataDesligamento!.getTime())
    .map(v => ({
      id: v.id,
      nome: v.nome,
      empresa: porEmpresa.get(v.empresaId)?.nome ?? "—",
      setor: v.setor.nome,
      cargo: v.posicao.nome,
      // Formatada aqui: um `Date` cruzando para o cliente volta a depender do
      // fuso do navegador, e as datas importadas estão gravadas em 03:00Z.
      data: formatarData(v.dataDesligamento),
    }));
}
