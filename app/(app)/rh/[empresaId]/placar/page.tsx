import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC, somarMesesUTC } from "@/lib/datas";
import { calcularTurnover, tempoMedioDeCasaAnos } from "@/lib/bi";
// Mesmo piso do detector de anomalias. É a mesma pergunta ("esta unidade tem
// gente suficiente para uma taxa significar algo?"), então é o mesmo número —
// duas telas discordando sobre quem é pequeno demais seria pior do que o valor
// exato ser 15 ou 12.
import { PISO_ATIVOS } from "@/lib/anomalias";
import { medirQualidadeSalarial } from "@/lib/qualidade-salarial";
import { normalizarTexto } from "@/lib/text";
import { PlacarView } from "./placar-view";
import type { ForaDoRecorte, LinhaPlacar, OpcaoSetor } from "./placar-view";

/**
 * Placar do grupo: um CNPJ por linha.
 *
 * Painel e Indicadores usam `empresasDaMesmaMarca`, e por isso os 5 CNPJs da LM
 * Telecom viram uma linha de 31,1% de turnover. Ninguém no grupo tem 31%: a RSM
 * tem 40,9% e a LM SISTEMAS tem 0,0%. A tela existe para desfazer essa média —
 * então aqui o escopo é `empresasVisiveis`, o que o usuário enxerga, e o
 * agrupamento é por CNPJ.
 *
 * A agregação mora nesta page e não em `lib/`: por enquanto há um consumidor só.
 * Se aparecer um segundo (CSV, ferramenta do assistente), o certo é extrair para
 * `lib/placar.ts` no mesmo estilo puro de `lib/bi.ts`, e não copiar daqui.
 */

const JANELAS = [3, 6, 12, 24];
const JANELA_PADRAO = 12;

/**
 * Abaixo desta cobertura de salário a soma deixa de descrever a empresa.
 *
 * Não é o mesmo teste que "ninguém tem salário": a Centrysol tem 1 salário em 39
 * ativos, e somar dá R$ 1.621 — um número que parece real e não é. Zero seria
 * mentira óbvia; R$ 1.621 é mentira convincente, que é pior. Acima do piso a
 * soma vale como PISO da folha e a tela diz quantos entraram nela.
 *
 * Hoje o dado é binário (100% ou ≈0%), então nenhum CNPJ muda de lado se o
 * número virar 0,4 ou 0,6 — o corte só passa a decidir alguma coisa no dia em
 * que alguém importar meia folha.
 */
const COBERTURA_MINIMA_FOLHA = 0.5;

type Vinculo = {
  empresaId: string;
  ativo: boolean;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  salarioBase: number | null;
  setorId: string | null;
  setor: { nome: string } | null;
  posicao: { nome: string };
  sexo: string | null;
  tipoContrato: string | null;
  jornadaSemanal: number | null;
};

export default async function PlacarPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; setor?: string; janela?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, setor: setorParam, janela: janelaParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);

  // Mesma regra de `filtro-empresas.tsx::useFiltroEmpresas`: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — um id digitado à mão
  // não vira acesso. A regra está escrita aqui porque aquele módulo é "use
  // client" e importá-lo de um Server Component traz uma referência de cliente,
  // não a função. Se ela mudar lá, precisa mudar aqui.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter(id => visiveis.includes(id));

  const janela = JANELAS.includes(Number(janelaParam)) ? Number(janelaParam) : JANELA_PADRAO;
  const hoje = hojeUTC();
  const inicioDaJanela = somarMesesUTC(hoje, -janela);

  const [empresas, todosOsVinculos] = await Promise.all([
    // Todas as visíveis, não só as do escopo: os seletores de marca e CNPJ
    // precisam oferecer o que está fora do filtro atual, senão filtrar em um
    // CNPJ tranca a pessoa nele.
    prisma.empresa.findMany({
      where: { id: { in: visiveis }, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, marca: { select: { nome: true } } },
    }),
    // `select` explícito: `salarioBase` é lido aqui só para virar soma e
    // contagem. Nenhum salário individual entra em `LinhaPlacar`, e portanto
    // nenhum é serializado no HTML que vai para o navegador — a matriz de papéis
    // trata salário como dado de Diretoria/RH. A exceção medida é a lista de
    // abaixo do piso da seção de qualidade: o VALOR desce (é o diagnóstico),
    // mas sem `nome` nem `id` — a lib nem aceita esses campos.
    // `sexo`/`tipoContrato`/`jornadaSemanal` viram só contagem agregada.
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo } },
      select: {
        empresaId: true,
        ativo: true,
        dataAdmissao: true,
        dataDesligamento: true,
        salarioBase: true,
        setorId: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        sexo: true,
        tipoContrato: true,
        jornadaSemanal: true,
      },
    }),
  ]);

  const setores = montarOpcoesDeSetor(todosOsVinculos);
  const setorSelecionado =
    setorParam && setores.some(s => s.chave === setorParam) ? setorParam : null;

  // O filtro de setor corta ativos E desligados: o turnover do Comercial precisa
  // do numerador e do denominador no mesmo recorte. `setorId` sobrevive ao
  // desligamento, então quem saiu continua contando no setor em que estava.
  const vinculos = setorSelecionado
    ? todosOsVinculos.filter(v => v.setor && normalizarTexto(v.setor.nome) === setorSelecionado)
    : todosOsVinculos;

  const empresasNoEscopo = empresas.filter(e => escopo.includes(e.id));

  const linhas = empresasNoEscopo.map(e =>
    montarLinha(
      { empresaId: e.id, empresa: e.nome, marca: e.marca.nome },
      vinculos.filter(v => v.empresaId === e.id),
      hoje,
      janela,
      setorSelecionado !== null
    )
  );

  // O consolidado é o POOL de todos os vínculos do recorte, não a média das
  // linhas. Média simples dá o mesmo peso à Mobility (4 pessoas) e à RSM (68) e
  // hoje sai em 16,1% contra 26,6% do pool. As duas se chamam "média do grupo"
  // na conversa, então a tela mostra as duas e diz qual é qual.
  const grupo =
    linhas.length > 0
      ? montarLinha(
          { empresaId, empresa: "Grupo consolidado", marca: "" },
          vinculos,
          hoje,
          janela,
          setorSelecionado !== null,
          // O consolidado nunca sai do topo: o piso de amostra vale para
          // comparar CNPJs entre si, e o grupo não está no ranking.
          true
        )
      : null;

  const comTurnover = linhas.filter(l => l.turnoverPct !== null);
  const mediaSimplesPct =
    comTurnover.length > 0
      ? comTurnover.reduce((t, l) => t + (l.turnoverPct ?? 0), 0) / comTurnover.length
      : null;

  const foraDoRecorte = montarForaDoRecorte(vinculos, empresasNoEscopo, linhas, inicioDaJanela);

  // Mesmo recorte da tabela (escopo de empresas + filtro de setor), mas cargo
  // agregado no GRUPO do recorte, não por CNPJ: política salarial é decisão de
  // cargo, e fatiar por CNPJ deixaria quase toda linha abaixo do piso de amostra.
  const qualidadeSalarial = medirQualidadeSalarial(vinculos.filter(v => v.ativo));

  return (
    <PlacarView
      empresaId={empresaId}
      linhas={linhas}
      grupo={grupo}
      foraDoRecorte={foraDoRecorte}
      janela={janela}
      janelas={JANELAS}
      setorSelecionado={setorSelecionado}
      setores={setores}
      empresasDisponiveis={empresas.map(e => ({ id: e.id, nome: e.nome, marca: e.marca.nome }))}
      empresasSelecionadas={escopo}
      mediaSimplesPct={mediaSimplesPct}
      pisoAtivos={PISO_ATIVOS}
      qualidadeSalarial={qualidadeSalarial}
    />
  );
}

// ---------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------

function montarLinha(
  identidade: { empresaId: string; empresa: string; marca: string },
  vinculos: Vinculo[],
  hoje: Date,
  janela: number,
  filtradoPorSetor: boolean,
  ehGrupo = false
): LinhaPlacar {
  const ativos = vinculos.filter(v => v.ativo);
  const turnover = calcularTurnover(vinculos, ativos.length, hoje, janela);

  // `calcularTurnover` devolve 0% quando o headcount médio é 0 — é a única saída
  // possível de uma divisão que não dá para fazer. Aqui isso vira null: sem
  // ninguém no recorte, 0% de turnover seria retenção perfeita no papel.
  const turnoverPct = turnover.headcountMedio > 0 ? turnover.taxaPct : null;

  // Somado à mão em vez de `custoPessoalPorSetor`: aquela função resolve folha
  // POR SETOR e faz `salarioBase ?? 0`, que é exatamente o que esta coluna não
  // pode fazer — perderia a contagem de quem tem salário, que é o que decide
  // entre mostrar um número e escrever "sem dado".
  const comSalario = ativos.filter(v => v.salarioBase != null);
  const soma = comSalario.reduce((t, v) => t + (v.salarioBase ?? 0), 0);
  const cobreOSuficiente =
    ativos.length > 0 && comSalario.length / ativos.length >= COBERTURA_MINIMA_FOLHA;
  const folhaBase = cobreOSuficiente ? soma : null;

  const tempo = tempoMedioDeCasaAnos(ativos, hoje);
  const tempoMedioAnos = tempo.comData > 0 ? tempo.anos : null;

  // Cobertura dos campos que ESTA tabela consome, exigidos juntos: admissão
  // (turnover e tempo de casa), salário (folha) e setor (o filtro). Contar campo
  // a campo e tirar média diluiria o buraco — a Centrysol sairia em 76% com a
  // coluna de dinheiro inutilizável. Ficha completa é o teste honesto.
  const completas = ativos.filter(v => v.dataAdmissao && v.salarioBase != null && v.setorId);
  const coberturaPct = ativos.length > 0 ? (completas.length / ativos.length) * 100 : null;

  const desligadosSemData = vinculos.filter(v => !v.ativo && !v.dataDesligamento).length;

  const abaixoDoPiso = ativos.length < PISO_ATIVOS;
  const amostraPequena = !ehGrupo && abaixoDoPiso;

  return {
    ...identidade,
    ativos: ativos.length,
    admissoes: turnover.admissoes,
    desligamentos: turnover.desligados,
    saldo: turnover.admissoes - turnover.desligados,
    turnoverPct,
    folhaBase,
    comSalario: comSalario.length,
    tempoMedioAnos,
    coberturaPct,
    desligadosSemData,
    amostraPequena,
    motivoForaDoRanking: !amostraPequena
      ? null
      : ativos.length === 0
        ? filtradoPorSetor
          ? "nenhum ativo neste setor"
          : "nenhum ativo"
        : `amostra pequena: ${ativos.length} ativos`,
  };
}

function montarForaDoRecorte(
  vinculos: Vinculo[],
  empresas: { id: string; nome: string }[],
  linhas: LinhaPlacar[],
  inicioDaJanela: Date
): ForaDoRecorte {
  const semData = vinculos.filter(v => !v.ativo && !v.dataDesligamento);
  const porEmpresa = new Map<string, number>();
  for (const v of semData) porEmpresa.set(v.empresaId, (porEmpresa.get(v.empresaId) ?? 0) + 1);

  const ativos = vinculos.filter(v => v.ativo);

  return {
    desligadosSemData: semData.length,
    desligadosSemDataPorEmpresa: [...porEmpresa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, total]) => ({
        empresa: empresas.find(e => e.id === id)?.nome ?? "empresa desconhecida",
        total,
      })),
    // Tem data, mas antes do recorte: fica de fora por escolha da janela, não
    // por falta de cadastro. Misturar os dois grupos apagaria a diferença entre
    // "abra a janela" e "vá cobrar o DP".
    desligadosAntesDaJanela: vinculos.filter(
      v => v.dataDesligamento && v.dataDesligamento < inicioDaJanela
    ).length,
    ativosSemSalario: ativos.filter(v => v.salarioBase == null).length,
    empresasSemFolha: linhas.filter(l => l.folhaBase === null && l.ativos > 0).map(l => l.empresa),
  };
}

/**
 * Opções do filtro de setor, por NOME normalizado.
 *
 * `Setor` é por empresa — 48 linhas para 15 nomes distintos no grupo. Filtrar
 * por `setorId` mostraria o "Comercial" de um CNPJ só, com os outros cinco
 * zerados. A normalização também junta "Recursos Humanos" e "RECURSOS HUMANOS",
 * que existem as duas na base; exibe a grafia com mais gente, senão a opção com
 * 1 pessoa é a que aparece no menu.
 */
function montarOpcoesDeSetor(vinculos: Vinculo[]): OpcaoSetor[] {
  const porChave = new Map<string, { ativos: number; grafias: Map<string, number> }>();

  for (const v of vinculos) {
    if (!v.ativo || !v.setor) continue;
    const chave = normalizarTexto(v.setor.nome);
    if (!porChave.has(chave)) porChave.set(chave, { ativos: 0, grafias: new Map() });
    const entrada = porChave.get(chave)!;
    entrada.ativos++;
    entrada.grafias.set(v.setor.nome, (entrada.grafias.get(v.setor.nome) ?? 0) + 1);
  }

  return [...porChave.entries()]
    .map(([chave, { ativos, grafias }]) => ({
      chave,
      rotulo: [...grafias.entries()].sort((a, b) => b[1] - a[1])[0][0],
      ativos,
    }))
    .sort((a, b) => b.ativos - a.ativos || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
