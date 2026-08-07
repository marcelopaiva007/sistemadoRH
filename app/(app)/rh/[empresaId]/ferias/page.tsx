import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularFerias, type PeriodoAquisitivo } from "@/lib/ferias";
import {
  calcularPassivoFerias,
  resumirOrigemDoHistorico,
  resumirProgramacaoFerias,
  semHistoricoDeFerias,
  type ColaboradorParaPassivo,
  type PassivoFerias,
  type PessoaVencida,
} from "@/lib/ferias-passivo";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";
import { FeriasView } from "./ferias-view";

// Tela de Férias do Departamento Pessoal.
//
// Saiu de dentro de Vencimentos porque as duas coisas têm natureza diferente:
// documento vencido se renova, férias vencidas viram passivo em dobro (art.
// 137) e só se resolvem concedendo. Misturado, o alerta mais caro do RH ficava
// perdido no meio dos certificados de NR.
//
// Os períodos aquisitivos NÃO vêm do banco — `calcularFerias` deriva tudo da
// data de admissão mais as solicitações registradas. Ver lib/ferias.ts.
//
// ESCOPO: `empresasVisiveis`, não o CNPJ da URL. Férias vencidas são dívida do
// GRUPO — quem decide sobre elas decide sobre o caixa das 8 empresas, e ler CNPJ
// por CNPJ faz seis pessoas espalhadas em quatro empresas parecerem seis casos
// isolados. O filtro de marca/CNPJ da lateral continua valendo (`?empresas=`).
//
// PRIVACIDADE: `salarioBase` é buscado aqui e NÃO desce para o cliente. O que
// atravessa é o agregado (`PassivoFerias`) e, na lista nominal, apenas DIAS: o
// valor por pessoa é reversível (dias × salário ÷ 30 × 4/3 ⇒ salário) e esta
// tela é alcançável por GESTOR_SETOR. Dinheiro só aparece somado por CNPJ ou
// pelo grupo — mesmo critério já usado em Indicadores para custo por setor.

export type LinhaFerias = {
  colaboradorId: string;
  nome: string;
  empresaId: string;
  empresa: string;
  setor: string;
  admissao: string;
  periodo: PeriodoAquisitivo | null;
  /** Período aquisitivo corrente, ainda não fechado — traz `progresso` dos 12 meses. */
  emCurso: PeriodoAquisitivo | null;
  saldoTotal: number;
  semHistorico: boolean;
  /**
   * MESMA regra do cartão "Férias vencidas" da tela de Pendências
   * (lib/pendencias.ts): 12+ meses de casa e nenhuma férias APROVADA
   * começando no último ano. O cartão navega para cá com filtro=RISCO_DOBRA,
   * e a lista tem que bater com o número dele — pessoa a pessoa.
   */
  riscoDobra: boolean;
};

/** Passivo por pessoa SEM as colunas de dinheiro — ver nota de privacidade acima. */
export type PessoaVencidaNaTela = Omit<PessoaVencida, "reais" | "reaisEmDobro">;

/**
 * O recorte de `PassivoFerias` que pode ser serializado no HTML.
 *
 * `fila.linhas` também fica de fora: a fila por pessoa já é a tabela principal
 * desta tela, ordenada pelo mesmo critério — mandar as duas seria pagar o
 * transporte de 215 linhas duas vezes para desenhar a mesma informação.
 */
export type PassivoNaTela = Omit<PassivoFerias, "vencido" | "fila"> & {
  vencido: Omit<PassivoFerias["vencido"], "lista"> & { lista: PessoaVencidaNaTela[] };
  fila: Omit<PassivoFerias["fila"], "linhas">;
};

export default async function FeriasPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  // Mesma regra de `filtro-empresas.tsx::useFiltroEmpresas`: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão não
  // vira acesso. Repetida aqui (e não importada) porque aquele módulo é "use
  // client": importá-lo de um Server Component traz referência de cliente, não
  // função. Se mudar lá, muda aqui. Mesma duplicação registrada no Placar.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const hoje = hojeUTC();

  const [colaboradores, solicitacoes, empresas] = await Promise.all([
    // `select` explícito, nunca `include`: o que sai daqui é serializado no HTML.
    // `salarioBase` entra porque a provisão precisa dele, e sai antes de chegar
    // ao Client Component — ver a nota de privacidade no topo.
    prisma.colaborador.findMany({
      // TODOS os ativos, inclusive os sem data de admissão: é `calcularPassivoFerias`
      // que conta quem ficou de fora. Filtrar aqui faria o total nascer certo e mudo.
      where: { empresaId: { in: escopo }, ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        empresaId: true,
        dataAdmissao: true,
        salarioBase: true,
        empresa: { select: { nome: true } },
        setor: { select: { nome: true } },
        ferias: {
          where: { status: { in: ["APROVADA", "PENDENTE"] } },
          // dataInicio existe para `riscoDobra` — a mesma pergunta do cartão
          // de Pendências: houve férias APROVADA começando no último ano?
          select: {
            periodoAquisitivoInicio: true,
            dias: true,
            diasAbono: true,
            status: true,
            dataInicio: true,
          },
        },
      },
    }),
    // Sem filtro de status nem de colaborador ativo: aqui a pergunta não é
    // "quanto se deve", é "de onde veio este histórico e o que está agendado".
    // Um registro recusado ou de quem já saiu continua contando para responder
    // se o módulo é arquivo de importação ou ferramenta de programação.
    prisma.solicitacaoFerias.findMany({
      where: { empresaId: { in: escopo } },
      // `status` porque a regra de "programada" (contaComoProgramada) descarta
      // REPROVADA/CANCELADA — pedido morto não é agenda.
      select: { dataInicio: true, status: true, observacoes: true, solicitadoPorId: true },
    }),
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
  ]);

  const paraPassivo: ColaboradorParaPassivo[] = colaboradores.map((c) => ({
    colaboradorId: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresaNome: c.empresa.nome,
    dataAdmissao: c.dataAdmissao,
    salarioBase: c.salarioBase,
    solicitacoes: c.ferias,
  }));

  const passivo = calcularPassivoFerias(paraPassivo, hoje);
  const programacao = resumirProgramacaoFerias(solicitacoes, hoje);
  const origem = resumirOrigemDoHistorico(solicitacoes);

  // Mesmo recorte de lib/pendencias.ts (feriasVencidas): o cartão de
  // Pendências e o filtro "Risco de dobra" desta tela precisam contar as
  // mesmas pessoas — se as janelas divergirem, o número do cartão volta a não
  // bater com a lista que ele abre.
  const umAnoAtras = somarDiasUTC(hoje, -365);

  const linhas: LinhaFerias[] = [];
  for (const c of colaboradores) {
    if (!c.dataAdmissao) continue;
    const resumo = calcularFerias(c.dataAdmissao, c.ferias, hoje);
    // O período que o RH precisa resolver primeiro: o mais perto do limite
    // entre os que ainda têm saldo.
    const critico = resumo.periodos
      .filter((p) => p.status !== "EM_CURSO" && p.saldo > 0)
      .sort((a, b) => a.diasAteLimite - b.diasAteLimite)[0];

    linhas.push({
      colaboradorId: c.id,
      nome: c.nome,
      empresaId: c.empresaId,
      empresa: c.empresa.nome,
      setor: c.setor.nome,
      admissao: c.dataAdmissao.toISOString(),
      periodo: critico ?? null,
      emCurso: resumo.periodos.find((p) => p.status === "EM_CURSO") ?? null,
      saldoTotal: resumo.saldoDisponivel,
      // Mais de um período adquirido e nenhuma férias registrada é quase sempre
      // buraco de cadastro, não alguém que nunca saiu de férias — a base nasceu
      // sem histórico de gozo. A tela separa os dois casos para o número de
      // "vencidas" não nascer inflado. A regra mora em lib/ferias-passivo.ts
      // para tela e consolidado nunca discordarem sobre quem é "sem histórico".
      semHistorico: semHistoricoDeFerias(c.ferias, resumo.periodos),
      riscoDobra:
        c.dataAdmissao < umAnoAtras &&
        !c.ferias.some((f) => f.status === "APROVADA" && f.dataInicio >= umAnoAtras),
    });
  }

  const passivoNaTela: PassivoNaTela = {
    ...passivo,
    vencido: {
      ...passivo.vencido,
      // Campo a campo, e não `omit`: o que atravessa a fronteira servidor →
      // cliente fica escrito, e um campo novo na lib não desce sozinho.
      lista: passivo.vencido.lista.map((p) => ({
        colaboradorId: p.colaboradorId,
        nome: p.nome,
        empresaId: p.empresaId,
        empresa: p.empresa,
        dias: p.dias,
        vencidoHaDias: p.vencidoHaDias,
        desde: p.desde,
        semHistorico: p.semHistorico,
      })),
    },
    fila: {
      janelaMeses: passivo.fila.janelaMeses,
      pessoas: passivo.fila.pessoas,
      dias: passivo.fila.dias,
    },
  };

  const marcas = [...new Set(empresas.map((e) => e.marca.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <FeriasView
      empresaId={empresaId}
      linhas={linhas}
      passivo={passivoNaTela}
      programacao={programacao}
      origem={origem}
      escopo={{ cnpjs: empresas.length, marcas }}
    />
  );
}
