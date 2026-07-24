import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { UsuariosTable } from "./usuarios-table";

export default async function UsuariosPage() {
  await requireAdmin();

  const [usuarios, empresas, setores] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { nome: "asc" }],
    }),
    // O User (schema shared) não tem mais relação com Empresa/Setor (schema rh)
    // — só as colunas empresaId/setorId. Buscamos as listas completas —
    // incluindo inativas, para resolver o nome de um vínculo já desativado — e
    // cruzamos por id na tabela. O formulário filtra as ativas para os selects.
    prisma.empresa.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true },
    }),
    prisma.setor.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, empresaId: true, ativo: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">
          Contas de acesso ao sistema. RH_MANAGER e GESTOR_SETOR ficam vinculados a uma
          empresa (e, no caso de GESTOR_SETOR, também a um setor) do módulo de RH.
        </p>
      </div>
      <UsuariosTable usuarios={usuarios} empresas={empresas} setores={setores} />
    </div>
  );
}
