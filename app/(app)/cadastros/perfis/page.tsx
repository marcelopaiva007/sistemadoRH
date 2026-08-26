import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { PerfisView, type PerfilNaTela, type UsuarioComPerfis } from "./perfis-view";

// Perfis de acesso — a tela onde se desenha "o que cada um pode fazer", por
// tela, nos dois sistemas, e onde se dá cada perfil às pessoas. Onda 2a do
// controle de acesso.
//
// Editar perfil ou atribuí-lo é conceder acesso, então mora atrás de
// `requireGestaoUsuarios` (ADMIN e Diretoria), o mesmo portão de criar usuário.
export default async function PerfisPage() {
  await requireGestaoUsuarios();

  const [perfis, usuarios] = await Promise.all([
    prisma.perfil.findMany({
      orderBy: [{ sistema: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        grants: true,
        sistema: true,
        _count: { select: { usuarios: true } },
      },
    }),
    prisma.user.findMany({
      where: { ativo: true },
      orderBy: [{ nome: "asc" }],
      select: {
        id: true,
        nome: true,
        role: true,
        perfis: { select: { perfilId: true } },
      },
    }),
  ]);

  const naTela: PerfilNaTela[] = perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    grants: p.grants.split(",").map((g) => g.trim()).filter(Boolean),
    sistema: p.sistema,
    usuarios: p._count.usuarios,
  }));

  const usuariosComPerfis: UsuarioComPerfis[] = usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    role: u.role,
    perfilIds: u.perfis.map((p) => p.perfilId),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfis de acesso</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Um perfil é um pacote de permissões que você dá à pessoa — em vez de marcar tela por tela
          para cada uma. Escolha o que cada perfil vê e edita nos dois sistemas, e dê o perfil a quem
          precisa. Os quatro perfis padrão reproduzem o acesso de hoje: edite-os ou crie os seus.
        </p>
      </div>

      <PerfisView perfis={naTela} usuarios={usuariosComPerfis} />
    </div>
  );
}
