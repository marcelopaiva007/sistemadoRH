import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AprovacoesView } from "./aprovacoes-view";

// Central de aprovações: tudo que espera uma decisão do RH/gestor num lugar só
// — férias programadas, ausências registradas e documentos que o colaborador
// enviou pelo portal. Sempre escopada à empresa.
export default async function AprovacoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [ferias, ausencias, documentos, decididasRecentes] = await Promise.all([
    prisma.solicitacaoFerias.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        colaboradorId: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        diasAbono: true,
        observacoes: true,
        solicitadoPorNome: true,
        createdAt: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.ausencia.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
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
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    // Enviados pelo colaborador no portal e ainda sem aval: `conferidoEm` nulo
    // é a fila. Nada disso vale como verdade cadastral até alguém olhar.
    prisma.documentoColaborador.findMany({
      where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
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
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { empresaId, acao: { in: ["APROVAR", "REPROVAR", "CANCELAR"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, acao: true, resumo: true, usuarioNome: true, createdAt: true },
    }),
  ]);

  return (
    <AprovacoesView
      empresaId={empresaId}
      ferias={ferias}
      ausencias={ausencias}
      documentos={documentos}
      decididasRecentes={decididasRecentes}
    />
  );
}
