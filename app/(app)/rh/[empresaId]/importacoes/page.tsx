import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ImportacoesView } from "./importacoes-view";

// A confirmação da importação (server action desta página) grava numa
// transação de até 60 s; sem teto explícito a função podia morrer antes da
// transação terminar, deixando o RH sem saber se gravou (26/11/2026).
export const maxDuration = 300;

// Importação em massa (Fase 6, etapa C): planilha de colaboradores em CSV,
// com conferência antes de gravar e histórico do que já foi importado.
export default async function ImportacoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [historico, empresa] = await Promise.all([
    prisma.importacaoArquivo.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, cnpj: true },
    }),
  ]);

  return (
    <ImportacoesView
      empresaId={empresaId}
      empresaNome={empresa?.nome ?? ""}
      empresaTemCnpj={Boolean(empresa?.cnpj)}
      historico={historico.map((h) => ({
        id: h.id,
        arquivoNome: h.arquivoNome,
        totalLinhas: h.totalLinhas,
        criados: h.criados,
        atualizados: h.atualizados,
        criadoPorNome: h.criadoPorNome,
        createdAt: h.createdAt,
      }))}
    />
  );
}
