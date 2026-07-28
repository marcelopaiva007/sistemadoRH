import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlterarSenhaForm } from "./alterar-senha-form";

const PAPEIS: Record<string, string> = {
  ADMIN: "Administrativo/Financeiro",
  DIRETORIA: "Diretoria/Gestão",
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Gestor de Setor",
};

// A conta do próprio usuário: quem ele é no sistema e a troca de senha.
//
// A barra do topo já apontava para cá desde que o nome do usuário virou link
// (o ícone de chave ao lado), mas a tela nunca existiu — o clique dava 404. A
// server action de trocar senha (lib/actions/conta.ts) já estava pronta.
export default async function ContaPage() {
  const user = await requireUser();

  // Empresa/setor são colunas soltas no User (sem @relation, para desativar
  // uma empresa não derrubar o login de quem estava vinculado); o nome se
  // resolve por lookup, e some se o vínculo tiver sido apagado.
  const [empresa, empresasDoRHManager, setor] = await Promise.all([
    user.empresaId
      ? prisma.empresa.findUnique({ where: { id: user.empresaId }, select: { nome: true } })
      : null,
    user.empresaIds.length > 0
      ? prisma.empresa.findMany({
          where: { id: { in: user.empresaIds } },
          orderBy: { nome: "asc" },
          select: { nome: true },
        })
      : [],
    user.setorId
      ? prisma.setor.findUnique({ where: { id: user.setorId }, select: { nome: true } })
      : null,
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p className="text-muted-foreground">
          Seus dados de acesso ao sistema. Para mudar nome, login ou perfil, fale com quem
          administra o sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-medium">{user.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Usuário de login</dt>
              <dd className="font-medium">{user.username}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Perfil</dt>
              <dd className="font-medium">{PAPEIS[user.role] ?? user.role}</dd>
            </div>
            {empresa && (
              <div>
                <dt className="text-muted-foreground">Empresa</dt>
                <dd className="font-medium">{empresa.nome}</dd>
              </div>
            )}
            {empresasDoRHManager.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">
                  {empresasDoRHManager.length === 1 ? "Empresa" : "Empresas"}
                </dt>
                <dd className="font-medium">
                  {empresasDoRHManager.map((e) => e.nome).join(", ")}
                </dd>
              </div>
            )}
            {setor && (
              <div>
                <dt className="text-muted-foreground">Setor</dt>
                <dd className="font-medium">{setor.nome}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trocar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm />
        </CardContent>
      </Card>
    </div>
  );
}
