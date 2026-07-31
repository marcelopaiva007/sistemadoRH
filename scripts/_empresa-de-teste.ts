// Escolhe a empresa em que os smokes vão rodar.
//
// Todos eles faziam `empresa.findFirst({ where: { ativo: true } })`. Isso
// funcionou enquanto havia poucas empresas e todas tinham gente. Em 29/07/2026
// entraram quatro CNPJs novos na marca LM Telecom, ainda vazios — e o findFirst
// passou a devolver "BR SISTEMAS LTDA". Catorze smokes começaram a morrer em
// "Nenhum colaborador ativo" e o de ATS em P2025 no Setor, sem que nada no
// código tivesse quebrado. Falha de fixture parece falha de produto e custa
// tempo de investigação.
//
// Aqui a escolha é pela empresa com mais colaboradores ativos, exigindo o que o
// smoke precisa. Se nenhuma servir, o erro diz o que faltou em vez de estourar
// lá adiante, longe da causa.

type ClientePrisma = {
  empresa: { findMany: (args: unknown) => Promise<{ id: string; nome: string }[]> };
  colaborador: { count: (args: unknown) => Promise<number> };
  setor: { count: (args: unknown) => Promise<number> };
};

export async function empresaDeTeste(
  prisma: ClientePrisma,
  requisitos: { colaboradoresAtivos?: number; comSetor?: boolean } = {},
): Promise<{ id: string; nome: string }> {
  const { colaboradoresAtivos = 1, comSetor = false } = requisitos;

  const empresas = await prisma.empresa.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const candidatas: { empresa: { id: string; nome: string }; ativos: number }[] = [];
  for (const empresa of empresas) {
    const ativos = await prisma.colaborador.count({
      where: { empresaId: empresa.id, ativo: true },
    });
    if (ativos < colaboradoresAtivos) continue;
    if (comSetor) {
      const setores = await prisma.setor.count({ where: { empresaId: empresa.id, ativo: true } });
      if (setores === 0) continue;
    }
    candidatas.push({ empresa, ativos });
  }

  if (candidatas.length === 0) {
    const exigencia = [
      `${colaboradoresAtivos} colaborador(es) ativo(s)`,
      comSetor ? "ao menos um setor ativo" : null,
    ]
      .filter(Boolean)
      .join(" e ");
    throw new Error(
      `Nenhuma das ${empresas.length} empresas ativas tem ${exigencia}. ` +
        `Não é falha do código sob teste — é falta de dado para exercitá-lo.`,
    );
  }

  candidatas.sort((a, b) => b.ativos - a.ativos);
  return candidatas[0].empresa;
}
