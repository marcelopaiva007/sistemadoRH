import { requireAreaAdmin } from "@/lib/grupo-guard";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { prisma } from "@/lib/prisma";
import {
  PerfisView,
  type PerfilNaTela,
  type UsuarioComPerfis,
} from "./perfis-view";

// Perfis de acesso — a tela onde se desenha "o que cada um pode fazer", por
// tela, nos dois sistemas, e onde se dá cada perfil às pessoas. Onda 2a do
// controle de acesso.
//
// Editar perfil ou atribuí-lo é conceder acesso, então mora no mesmo portão de
// criar usuário: a área de administração, só da conta MASTER (v1.188.0 — até
// a v1.187.0 era /cadastros/perfis, aberta também a ADMIN e Diretoria).
export default async function PerfisPage() {
  await requireAreaAdmin();

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
      // Acessos de portal (funcionários sem login do sistema, criados pelo
      // módulo Delegações) ficam FORA desta lista: eles não operam o sistema,
      // e com algumas centenas deles a tela viraria uma lista de gente que
      // nunca vai entrar aqui. Ver lib/delegacoes/acesso-colaborador.ts.
    prisma.user.findMany({
      where: {
        ativo: true,
        // As contas de todos os grupos: o perfil é um molde comum aos grupos.
        role: { notIn: [PAPEL_PORTAL, "MASTER"] },
      },
      // Ordem por grupo e depois nome; o login e o grupo vão junto porque a
      // regra é UM login por grupo — a mesma pessoa pode aparecer duas vezes
      // com o mesmo nome, e dar perfil à conta errada seria fácil sem eles.
      orderBy: [{ grupo: { nome: "asc" } }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        username: true,
        role: true,
        grupo: { select: { nome: true } },
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
    username: u.username,
    grupoNome: u.grupo?.nome ?? null,
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
