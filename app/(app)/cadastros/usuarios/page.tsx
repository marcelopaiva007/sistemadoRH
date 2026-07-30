import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { UsuariosTable } from "./usuarios-table";

export default async function UsuariosPage() {
  const admin = await requireAdmin();

  const [usuarios, empresas, setores] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { nome: "asc" }],
      include: {
        empresas: {
          orderBy: [{ papelPrincipal: "desc" }, { createdAt: "asc" }],
          include: {
            empresa: { select: { id: true, nome: true, ativo: true } },
            setor: { select: { id: true, nome: true } },
          },
        },
      },
    }),
    // O User não tem @relation com Empresa/Setor — só as colunas
    // empresaId/setorId, para desativar uma empresa não derrubar o login de
    // quem estava vinculado a ela. Buscamos as listas completas — incluindo as
    // inativas, para resolver o nome de um vínculo já desativado — e cruzamos
    // por id na tabela. O formulário filtra as ativas para os selects.
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
          Contas de acesso ao sistema. ADMIN e Diretoria são perfis globais.
          Gestores de RH e de Setor ficam vinculados a uma ou mais empresas
          do grupo.
        </p>
      </div>
      <UsuariosTable
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nome: u.nome,
          username: u.username,
          email: u.email,
          telefone: u.telefone,
          role: u.role,
          ativo: u.ativo,
          empresas: u.empresas.map((e) => ({
            empresaId: e.empresaId,
            empresaNome: e.empresa.nome,
            empresaAtiva: e.empresa.ativo,
            role: e.role,
            setorId: e.setorId,
            setorNome: e.setor?.nome ?? null,
            ativo: e.ativo,
            papelPrincipal: e.papelPrincipal,
          })),
        }))}
        empresas={empresas}
        setores={setores}
        currentUserId={admin.id}
      />
    </div>
  );
}