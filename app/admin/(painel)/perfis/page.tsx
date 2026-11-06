import Link from "next/link";
import { requireAreaAdmin } from "@/lib/grupo-guard";
import { cn } from "@/lib/utils";
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
export default async function PerfisPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  await requireAreaAdmin();

  // PERFIS POR CLIENTE (v1.199.0): as abas são os clientes, mais a dos
  // MODELOS FASTMAI (?grupo=modelos). Cada aba mostra só os perfis e as
  // contas daquele cliente — perfil de um cliente nunca aparece em outro.
  const grupos = await prisma.grupo.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  const pedido = (await searchParams).grupo;
  const verModelos = pedido === "modelos";
  const grupoId = verModelos ? null : ((grupos.find((g) => g.id === pedido) ?? grupos[0])?.id ?? null);
  const filtroGrupo = verModelos ? null : (grupoId ?? "__nenhum__");

  const [perfis, usuarios] = await Promise.all([
    prisma.perfil.findMany({
      where: { grupoId: filtroGrupo },
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
    // Acessos de portal (funcionários sem login do sistema) ficam FORA: eles
    // não operam o sistema. Modelos não têm contas.
    verModelos
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { ativo: true, grupoId: filtroGrupo, role: { notIn: [PAPEL_PORTAL, "MASTER"] } },
          orderBy: { nome: "asc" },
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

  const aba = (href: string, ativo: boolean, rotulo: string) => (
    <Link
      key={href}
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm font-medium",
        ativo ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {rotulo}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfis de acesso</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Um perfil é um pacote de permissões que se dá à pessoa. Cada cliente tem os seus perfis e pode
          ajustá-los sem afetar os outros; os <strong>modelos FASTMAI</strong> são a base que cada cliente novo
          recebe.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Cliente:</span>
        {grupos.map((g) => aba(`/admin/perfis?grupo=${g.id}`, !verModelos && g.id === grupoId, g.nome))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {aba("/admin/perfis?grupo=modelos", verModelos, "Modelos FASTMAI")}
      </div>

      <PerfisView perfis={naTela} usuarios={usuariosComPerfis} grupoId={verModelos ? null : grupoId} />
    </div>
  );
}
