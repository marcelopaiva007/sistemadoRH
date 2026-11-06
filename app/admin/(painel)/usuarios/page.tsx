import Link from "next/link";
import { requireAreaAdmin } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { AjudaDaTela } from "@/components/ajuda-da-tela";
import { PERFIS_SEMENTE } from "@/lib/permissoes/catalogo";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { UsuariosTable } from "./usuarios-table";
import { cn } from "@/lib/utils";

// Usuários — a tela que deu origem à área de administração (v1.188.0). Até a
// v1.187.0 morava dentro do sistema (/cadastros/usuarios) e ADMIN e DIRETORIA
// também a abriam; agora só a conta MASTER, aqui.
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  const admin = await requireAreaAdmin();

  // GRUPO (sociedade — lib/grupo.ts): a tela mostra as contas, CNPJs e marcas
  // de UM grupo, escolhido nas abas "Grupo:" — a conta criada aqui nasce no
  // grupo aberto.
  const grupos = await prisma.grupo.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  const pedido = (await searchParams).grupo;
  const grupoId = (grupos.find((g) => g.id === pedido) ?? grupos[0])?.id ?? null;
  // Sem grupo resolvido, nada aparece — falha fechada.
  const doGrupo = grupoId ?? "__nenhum__";

  // As marcas ativas de TODOS os grupos, para a ação "Marcas" poder trocar a
  // conta de grupo e marcar as do novo.
  const marcasDeTodosOsGrupos = await prisma.marca.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, grupoId: true },
  });

  const [usuarios, empresas, setores, marcas, perfis] = await Promise.all([
      // Acessos de portal (funcionários sem login do sistema, criados pelo
      // módulo Delegações) ficam FORA desta lista: eles não operam o sistema,
      // e com algumas centenas deles a tela viraria uma lista de gente que
      // nunca vai entrar aqui. Ver lib/delegacoes/acesso-colaborador.ts.
    prisma.user.findMany({
      where: { role: { notIn: [PAPEL_PORTAL, "MASTER"] }, grupoId: doGrupo },
      orderBy: [{ role: "asc" }, { nome: "asc" }],
      include: {
        empresas: {
          orderBy: [{ papelPrincipal: "desc" }, { createdAt: "asc" }],
          include: {
            // O grupo da marca do CNPJ vai junto só para a tela marcar o
            // vínculo que ficou em outro grupo de sociedade — ele não dá acesso.
            empresa: { select: { id: true, nome: true, ativo: true, marca: { select: { grupoId: true } } } },
            setor: { select: { id: true, nome: true } },
          },
        },
        // Vínculo por marca vem separado das empresas de propósito: ele não
        // aponta para um CNPJ, cobre todos os da marca — inclusive os que
        // forem cadastrados depois. A tela precisa mostrar os dois lado a lado.
        marcas: {
          orderBy: { createdAt: "asc" },
          include: { marca: { select: { id: true, nome: true, grupoId: true } } },
        },
        // Qual pessoa da folha é este login. Diferente dos vínculos acima: eles
        // dizem ONDE o usuário mexe, este diz QUEM ele é — é o que permite a
        // tela mostrar o time dele.
        colaborador: {
          select: {
            id: true,
            nome: true,
            empresa: { select: { nome: true } },
            setor: { select: { nome: true } },
          },
        },
        // Perfis de acesso já atribuídos — para o formulário pré-marcar na edição.
        perfis: { select: { perfilId: true } },
      },
    }),
    // O User não tem @relation com Empresa/Setor — só as colunas
    // empresaId/setorId, para desativar uma empresa não derrubar o login de
    // quem estava vinculado a ela. Buscamos as listas completas — incluindo as
    // inativas, para resolver o nome de um vínculo já desativado — e cruzamos
    // por id na tabela. O formulário filtra as ativas para os selects.
    prisma.empresa.findMany({
      where: { marca: { grupoId: doGrupo } },
      orderBy: { nome: "asc" },
      // marcaId vai junto para a tela agrupar os CNPJs por marca no select —
      // com várias marcas no grupo, uma lista chapada de nomes não diz a quem
      // cada CNPJ pertence.
      select: { id: true, nome: true, ativo: true, marcaId: true },
    }),
    prisma.setor.findMany({
      where: { empresa: { marca: { grupoId: doGrupo } } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, empresaId: true, ativo: true },
    }),
    // Só as marcas ativas: aqui a lista serve para conceder acesso novo, e
    // conceder acesso a uma marca desativada não faz sentido. Vínculo antigo
    // numa marca desativada continua aparecendo pelo include acima.
    prisma.marca.findMany({
      where: { ativo: true, grupoId: doGrupo },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    // Perfis de acesso ativos — para o formulário oferecer "conectar o usuário
    // ao perfil" na própria criação.
    prisma.perfil.findMany({
      where: { ativo: true },
      orderBy: [{ sistema: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, sistema: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <AjudaDaTela modulo="usuarios" />
        </div>
        <p className="text-muted-foreground">
          As contas de acesso de cada grupo — um cadastro só para os dois sistemas. Aqui você cria,
          edita e desativa contas e escolhe as marcas que cada pessoa vê. O que cada uma pode fazer,
          por tela e por sistema, vem dos{" "}
          <Link href="/admin/perfis" className="underline underline-offset-2 hover:text-foreground">perfis de acesso</Link>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Grupo:</span>
        {grupos.map((g) => (
          <Link
            key={g.id}
            href={`/admin/usuarios?grupo=${g.id}`}
            aria-current={g.id === grupoId ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              g.id === grupoId
                ? "border-primary bg-primary/10 font-medium"
                : "hover:bg-muted",
            )}
          >
            {g.nome}
          </Link>
        ))}
      </div>
      <UsuariosTable
        usuarios={usuarios.map((u) => ({
          id: u.id,
          perfilIds: u.perfis.map((p) => p.perfilId),
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
            foraDoGrupo: e.empresa.marca.grupoId !== doGrupo,
          })),
          marcasVinculadas: u.marcas.map((m) => ({
            marcaId: m.marcaId,
            marcaNome: m.marca.nome,
            ativo: m.ativo,
            foraDoGrupo: m.marca.grupoId !== doGrupo,
            role: m.role,
          })),
          ficha: u.colaborador && {
            id: u.colaborador.id,
            nome: u.colaborador.nome,
            empresaNome: u.colaborador.empresa.nome,
            setorNome: u.colaborador.setor.nome,
          },
        }))}
        empresas={empresas}
        setores={setores}
        marcas={marcas}
        perfis={perfis.map((p) => ({
          id: p.id,
          nome: p.nome,
          sistema: p.sistema,
          papelDeOrigem: PERFIS_SEMENTE.find((sem) => sem.id === p.id)?.papelDeOrigem ?? null,
        }))}
        currentUserId={admin.id}
        grupoId={grupoId ?? undefined}
        painelAdmin={{ grupos, marcas: marcasDeTodosOsGrupos, grupoAtualId: grupoId }}
      />
    </div>
  );
}