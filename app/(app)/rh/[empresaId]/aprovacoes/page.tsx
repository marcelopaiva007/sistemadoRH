import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AprovacoesView } from "./aprovacoes-view";

// Central de aprovações: tudo que espera uma decisão do RH/gestor num lugar só
// — férias programadas, ausências registradas e documentos que o colaborador
// enviou pelo portal.
//
// ESCOPO: `empresasVisiveis` + filtro `?empresas=` da barra lateral — mesmo
// padrão do resto do módulo RH (ver app/(app)/rh/[empresaId]/ferias/page.tsx).
// Antes usava `empresasDaMesmaMarca`, que ignorava permissão por usuário e o
// filtro da lateral; a marca inteira sempre entrava, sem opção de restringir.
export default async function AprovacoesPage({
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
  // Mesma regra de filtro-empresas.tsx::useFiltroEmpresas: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão não
  // vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopoIds = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));
  const escopo = { in: escopoIds };

  const [ferias, ausencias, documentos, decididasRecentes] = await Promise.all([
    prisma.solicitacaoFerias.findMany({
      where: { empresaId: escopo, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        empresaId: true,
        colaboradorId: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        diasAbono: true,
        observacoes: true,
        solicitadoPorNome: true,
        createdAt: true,
        colaborador: {
          select: { nome: true, setor: { select: { nome: true } }, empresa: { select: { nome: true } } },
        },
      },
    }),
    prisma.ausencia.findMany({
      where: { empresaId: escopo, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        empresaId: true,
        colaboradorId: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        abonada: true,
        observacoes: true,
        registradoPorNome: true,
        createdAt: true,
        arquivo: { select: { id: true, nome: true } },
        colaborador: {
          select: { nome: true, setor: { select: { nome: true } }, empresa: { select: { nome: true } } },
        },
      },
    }),
    // Enviados pelo colaborador no portal e ainda sem aval: `conferidoEm` nulo
    // é a fila. Nada disso vale como verdade cadastral até alguém olhar.
    prisma.documentoColaborador.findMany({
      where: { empresaId: escopo, origem: "COLABORADOR", conferidoEm: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        empresaId: true,
        colaboradorId: true,
        tipo: true,
        descricao: true,
        emitidoEm: true,
        validoAte: true,
        observacoes: true,
        createdAt: true,
        arquivo: { select: { id: true, nome: true, tamanhoBytes: true } },
        // Os números que a própria pessoa digitou. Conferir o anexo contra eles
        // é o trabalho — sem isso o RH abre a foto sem saber com o que comparar.
        colaborador: {
          select: {
            nome: true, cpf: true, rg: true, rgOrgaoEmissor: true, rgUf: true,
            pis: true, ctpsNumero: true, ctpsSerie: true, ctpsUf: true, tituloEleitor: true,
            setor: { select: { nome: true } },
            empresa: { select: { nome: true } },
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { empresaId: escopo, acao: { in: ["APROVAR", "REPROVAR", "CANCELAR"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, acao: true, resumo: true, usuarioNome: true, createdAt: true },
    }),
  ]);

  return (
    <AprovacoesView
      ferias={ferias}
      ausencias={ausencias}
      documentos={documentos}
      decididasRecentes={decididasRecentes}
    />
  );
}
