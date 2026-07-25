import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ETAPAS_EM_ANDAMENTO } from "@/lib/constants-ats";
import { CandidatosView } from "./candidatos-view";

// Banco de talentos: todo mundo que já se candidatou alguma vez na empresa,
// independente de a vaga ainda existir. A busca é por nome/e-mail/cidade e,
// quando há dígitos, também por telefone/CPF — o RH costuma lembrar de um
// fragmento, não do cadastro inteiro.
export default async function CandidatosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ q?: string; disponivel?: string }>;
}) {
  const { empresaId } = await params;
  const { q, disponivel } = await searchParams;
  await requireEmpresaAccess(empresaId);

  const busca = (q ?? "").trim();
  const soDisponiveis = disponivel === "1";

  const digitos = busca.replace(/\D/g, "");
  const filtroBusca = busca
    ? {
        OR: [
          { nome: { contains: busca, mode: "insensitive" as const } },
          { email: { contains: busca, mode: "insensitive" as const } },
          { cidade: { contains: busca, mode: "insensitive" as const } },
          // Telefone e CPF só entram quando a busca tem dígitos — procurar
          // string vazia neles casaria com todo mundo.
          ...(digitos ? [{ telefone: { contains: digitos } }, { cpf: { contains: digitos } }] : []),
        ],
      }
    : {};

  const candidatos = await prisma.candidato.findMany({
    where: { empresaId, ...filtroBusca },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      nome: true,
      cpf: true,
      email: true,
      telefone: true,
      cidade: true,
      origem: true,
      createdAt: true,
      arquivo: { select: { id: true, nome: true } },
      candidaturas: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          etapa: true,
          updatedAt: true,
          vaga: { select: { id: true, titulo: true } },
        },
      },
    },
  });

  const emAndamento = new Set<string>(ETAPAS_EM_ANDAMENTO);
  const lista = candidatos
    .map((c) => ({
      ...c,
      // "Disponível" = não está em processo ativo em nenhuma vaga agora nem
      // já foi contratado. É esse filtro que faz o banco de talentos valer:
      // quem já foi avaliado antes e está livre para uma vaga nova.
      emProcesso: c.candidaturas.some((cd) => emAndamento.has(cd.etapa)),
      jaContratado: c.candidaturas.some((cd) => cd.etapa === "CONTRATADO"),
    }))
    .filter((c) => (soDisponiveis ? !c.emProcesso && !c.jaContratado : true));

  return (
    <CandidatosView
      empresaId={empresaId}
      candidatos={lista}
      busca={busca}
      soDisponiveis={soDisponiveis}
    />
  );
}
