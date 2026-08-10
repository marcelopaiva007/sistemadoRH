import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC, somarAnosUTC } from "@/lib/datas";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { ColaboradoresTable } from "./colaboradores-table";

export default async function ColaboradoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  // Mesma regra da tela inicial da empresa: o padrão é a MARCA do caminho, e o
  // filtro ?empresas= (árvore da lateral) estreita DENTRO dela. Até 10/08/2026
  // o padrão era tudo que o usuário enxerga — quem abria a Vapt com acesso ao
  // grupo via os colaboradores dos 11 CNPJs misturados, e "em cada CNPJ os
  // devidos colaboradores" foi exatamente o pedido do RH. De brinde, a base
  // inteira deixa de ser serializada para o navegador a cada abertura.
  const [todasDaMarca, visiveis] = await Promise.all([
    empresasDaMesmaMarca(empresaId),
    empresasVisiveis(usuario),
  ]);
  const daMarcaVisiveis = todasDaMarca.filter((id) => visiveis.includes(id));
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo =
    pedidas.length === 0 ? daMarcaVisiveis : daMarcaVisiveis.filter((id) => pedidas.includes(id));

  const [linhas, setores, posicoes] = await Promise.all([
    // `select` explícito, não `include`: esta lista vai inteira para um Client
    // Component, e tudo que entra aqui é serializado no HTML enviado ao
    // navegador. Com `include` iam junto salarioBase, bancoConta, bancoAgencia,
    // chavePix, rg, pis e o resto da ficha — de toda a base visível, mesmo sem
    // a tela mostrar nada disso. São os mesmos campos que lib/audit.ts trata
    // como sensíveis.
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo } },
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
        _count: { select: { ferias: true } },
      },
    }),
    // Buscar setores/posições para TODA a marca, não apenas o escopo filtrado.
    // O usuário pode ter aberto um CNPJ específico sem cargos, mas quer oferecer
    // aqueles que existem em irmãos da mesma marca (catálogo unificado).
    prisma.setor.findMany({ where: { empresaId: { in: daMarcaVisiveis }, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.posicao.findMany({ where: { empresaId: { in: daMarcaVisiveis }, ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  // empresaId → marcaId, para o formulário de novo/editar colaborador oferecer
  // só o catálogo da marca da empresa-alvo. O catálogo de setores/cargos foi
  // unificado por marca, e a validação no servidor aceita a marca inteira —
  // mas nunca outra marca (um ADMIN enxerga todas aqui).
  // Busca para TODA a marca visível (daMarcaVisiveis), não apenas o escopo
  // filtrado, porque os cargos/setores são catálogo unificado da marca.
  const empresasComMarca = await prisma.empresa.findMany({
    where: { id: { in: daMarcaVisiveis } },
    select: { id: true, marcaId: true },
  });
  const marcaPorEmpresa = Object.fromEntries(empresasComMarca.map((e) => [e.id, e.marcaId]));

  // O filtro "?lacuna=salario|admissao" só precisa saber SE o campo está vazio.
  // Trocar o valor pelo booleano aqui mantém salário e data de admissão dentro
  // do servidor sem perder o filtro.
  const umAnoAtras = somarAnosUTC(hojeUTC(), -1);
  const colaboradores = linhas.map(
    ({ salarioBase, dataAdmissao, dataDesligamento, motivoDesligamento, _count, ...c }) => ({
      ...c,
      semSalario: salarioBase === null || salarioBase === undefined,
      semAdmissao: !dataAdmissao,
      // Mesma regra de lib/dashboard.ts::lacunasDaBase e
      // lib/ferias-passivo.ts::semHistoricoDeFerias: 1+ ano de casa e nenhuma
      // solicitação de férias registrada.
      semFerias: Boolean(dataAdmissao && dataAdmissao < umAnoAtras && _count.ferias === 0),
      semDataDesligamento: !dataDesligamento,
      semMotivoDesligamento: !motivoDesligamento,
    }),
  );

  return (
    <ColaboradoresTable
      empresaId={empresaId}
      empresasDoEscopo={escopo}
      colaboradores={colaboradores}
      setores={setores}
      posicoes={posicoes}
      marcaPorEmpresa={marcaPorEmpresa}
    />
  );
}
