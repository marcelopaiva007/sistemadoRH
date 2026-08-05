import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { medirMalhaLideranca } from "@/lib/lideranca";
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
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresaIds } },
      select: { marca: { select: { nome: true } } },
    }),
  ]);

  const malha = medirMalhaLideranca(ativos);

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
      ativosPorEmpresa={ativosPorEmpresa}
      marcas={marcas}
    />
  );
}
