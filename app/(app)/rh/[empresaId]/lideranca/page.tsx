import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { medirMalhaLideranca } from "@/lib/lideranca";
import { medirBusFactor } from "@/lib/bus-factor";
import { calcularPassivoFerias } from "@/lib/ferias-passivo";
import { LiderancaView } from "./lideranca-view";

// Malha de liderança: quantos diretos cada líder carrega, quem está fora de
// qualquer equipe e onde as duas fontes de verdade sobre liderança discordam.
// A conta inteira vive em lib/lideranca.ts (funções puras, sem Prisma); aqui só
// se busca o dado e se escolhe o RECORTE — que é a decisão que faz esta tela
// mentir ou não.
//
// ESCOPO: tudo que o usuário enxerga (`empresasVisiveis`), nunca o CNPJ da URL.
// Neste grupo a liderança atravessa CNPJ: o maior líder tem 57 diretos vistos
// do grupo e 7 vistos do CNPJ onde ele está cadastrado, porque 50 dos 57 estão
// em outras empresas. Recorte por CNPJ não mostraria um span menor — mostraria
// uma estrutura saudável que não existe. Para quem só enxerga um CNPJ, a lib
// devolve um aviso explícito em vez de deixar o número passar como se fosse a
// realidade toda.
export default async function LiderancaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);
  const empresaIds = await empresasVisiveis(usuario);

  const [ativos, empresas] = await Promise.all([
    // `select` explícito, não `include`: mesmo motivo da lista de
    // colaboradores. Span of control precisa de nome, cargo, setor, CNPJ e
    // quem é o supervisor — não de salário, dado bancário ou documento. Com
    // `include` a ficha inteira de 215 pessoas seria serializada no HTML.
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, ativo: true },
      select: {
        id: true,
        nome: true,
        supervisorId: true,
        // Segunda fonte de verdade sobre liderança, e obrigatória no tipo da
        // lib: sem ela a lista de divergências sairia silenciosamente errada.
        gerente: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        empresa: { select: { nome: true } },
        empresaId: true,
        // Para o bus factor: tempo de casa do ocupante único e, via motor de
        // férias, se ele está com férias vencidas. Salário NÃO é buscado de
        // propósito — esta tela só precisa de DIAS vencidos, e sem salário no
        // recorte nenhum valor reversível a salário chega perto do cliente.
        dataAdmissao: true,
        ferias: {
          where: { status: { in: ["APROVADA", "PENDENTE"] } },
          select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
        },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresaIds } },
      select: { marca: { select: { nome: true } } },
    }),
  ]);

  const malha = medirMalhaLideranca(ativos);

  // Bus factor: quem está com férias vencidas vem do MESMO motor da tela de
  // Férias (calcularPassivoFerias), nunca de uma segunda regra. `salarioBase:
  // null` é deliberado: o cálculo de dias não depende de salário, e assim o
  // objeto inteiro nasce sem um real dentro — os avisos monetários do passivo
  // não são usados aqui, só a lista de vencidos.
  const hoje = hojeUTC();
  const passivo = calcularPassivoFerias(
    ativos.map(c => ({
      colaboradorId: c.id,
      nome: c.nome,
      empresaId: c.empresaId,
      empresaNome: c.empresa.nome,
      dataAdmissao: c.dataAdmissao,
      salarioBase: null,
      solicitacoes: c.ferias,
    })),
    hoje
  );
  const busFactor = medirBusFactor(ativos, malha.lideres, passivo.vencido.lista, hoje);

  // Quantos ativos cada CNPJ tem. Não é ornamento: é o que permite ler "52
  // diretos em uma empresa de 18 pessoas" — o número que separa estrutura real
  // de padrão herdado da importação. A lib não calcula isso porque headcount
  // por empresa não é assunto de span of control.
  const porEmpresa = new Map<string, number>();
  for (const c of ativos) {
    porEmpresa.set(c.empresa.nome, (porEmpresa.get(c.empresa.nome) ?? 0) + 1);
  }
  const ativosPorEmpresa = [...porEmpresa.entries()]
    .map(([empresa, total]) => ({ empresa, total }))
    .sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa, "pt-BR"));

  const marcas = [...new Set(empresas.map(e => e.marca.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return (
    <LiderancaView
      empresaId={empresaId}
      malha={malha}
      busFactor={busFactor}
      ativosPorEmpresa={ativosPorEmpresa}
      marcas={marcas}
    />
  );
}
