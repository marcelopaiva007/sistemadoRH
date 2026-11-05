import { requireMaster } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { GruposView } from "./grupos-view";

// Grupos de sociedade — a tela do MASTER (lib/grupo.ts).
//
// Mostra em que grupo mora cada marca e cada conta, e deixa mudar. Não mostra
// número nenhum de RH (colaboradores, folha, pendências): por decisão do CEO
// em 05/11/2026 o MASTER só administra, não enxerga o dado dos grupos.
export default async function GruposPage() {
  await requireMaster();

  const [grupos, marcas, usuarios] = await Promise.all([
    prisma.grupo.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true },
    }),
    prisma.marca.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        ativo: true,
        grupoId: true,
        _count: { select: { empresas: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: { notIn: [PAPEL_PORTAL, "MASTER"] } },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        username: true,
        role: true,
        ativo: true,
        grupoId: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Grupos</h1>
        <p className="max-w-3xl text-muted-foreground">
          Cada grupo é uma sociedade separada. Nenhuma tela, relatório ou e-mail
          junta dois grupos: quem trabalha num grupo não vê as marcas do outro,
          nem sendo ADMIN ou Diretoria. Aqui você decide em que grupo fica cada
          marca e cada conta. As contas de cada grupo são cadastradas em
          Usuários.
        </p>
      </div>
      <GruposView grupos={grupos} marcas={marcas} usuarios={usuarios} />
    </div>
  );
}
