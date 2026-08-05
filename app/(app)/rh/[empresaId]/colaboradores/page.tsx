import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ColaboradoresTable } from "./colaboradores-table";

export default async function ColaboradoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Buscar de todas as empresas que o usuário tem acesso
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [linhas, setores, posicoes] = await Promise.all([
    // `select` explícito, não `include`: esta lista vai inteira para um Client
    // Component, e tudo que entra aqui é serializado no HTML enviado ao
    // navegador. Com `include` iam junto salarioBase, bancoConta, bancoAgencia,
    // chavePix, rg, pis e o resto da ficha — de toda a base visível, mesmo sem
    // a tela mostrar nada disso. São os mesmos campos que lib/audit.ts trata
    // como sensíveis.
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        telegramChatId: true,
        supervisorId: true,
        gerente: true,
        ativo: true,
        empresaId: true,
        setorId: true,
        posicaoId: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        // Lidos só para derivar os booleanos abaixo — não seguem para o cliente.
        salarioBase: true,
        dataAdmissao: true,
        dataDesligamento: true,
        motivoDesligamento: true,
      },
    }),
    prisma.setor.findMany({ where: { empresaId: { in: empresasDoUsuario }, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.posicao.findMany({ where: { empresaId: { in: empresasDoUsuario }, ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  // O filtro "?lacuna=salario|admissao" só precisa saber SE o campo está vazio.
  // Trocar o valor pelo booleano aqui mantém salário e data de admissão dentro
  // do servidor sem perder o filtro.
  const colaboradores = linhas.map(({ salarioBase, dataAdmissao, dataDesligamento, motivoDesligamento, ...c }) => ({
    ...c,
    semSalario: salarioBase === null || salarioBase === undefined,
    semAdmissao: !dataAdmissao,
    semDataDesligamento: !dataDesligamento,
    semMotivoDesligamento: !motivoDesligamento,
  }));

  return (
    <ColaboradoresTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      colaboradores={colaboradores}
      setores={setores}
      posicoes={posicoes}
    />
  );
}
