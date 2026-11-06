import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { enderecoDaAreaAdmin } from "@/lib/area-admin";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlterarSenhaForm } from "@/components/alterar-senha-form";

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
  const enderecoAdmin = enderecoDaAreaAdmin();

  // Empresa/setor são colunas soltas no User (sem @relation, para desativar
  // uma empresa não derrubar o login de quem estava vinculado); o nome se
  // resolve por lookup, e some se o vínculo tiver sido apagado.
  const [empresa, setor] = await Promise.all([
    user.empresaId
      ? prisma.empresa.findUnique({ where: { id: user.empresaId }, select: { nome: true } })
      : null,
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

      {/* O caminho para a área de administração, à vista de quem dirige o
          grupo — pedido do dono (v1.188.0): logado com a conta do dia a dia,
          ninguém precisa decorar o endereço. */}
      {(user.role === "ADMIN" || user.role === "DIRETORIA") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Área de administração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Usuários, grupos e perfis de acesso são geridos fora do sistema, em{" "}
              <Link href="/admin/login" className="font-mono font-semibold text-primary hover:underline">
                {enderecoAdmin}
              </Link>
              , com a <strong>conta de administrador</strong> — não com esta.
            </p>
            <p className="text-muted-foreground">
              Entrar lá troca a sessão deste navegador. Para usar as duas ao mesmo tempo, abra o
              admin numa janela anônima.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
