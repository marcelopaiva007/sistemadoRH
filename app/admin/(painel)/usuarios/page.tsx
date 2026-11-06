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
// também a abriam; agora só a conta MASTER, aqui. Desde a v1.192.0 (Gestão
// FASTMAI) as abas são os CLIENTES — no banco, os grupos de sociedade.
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  const admin = await requireAreaAdmin();

  // CLIENTE (o grupo de sociedade — lib/grupo.ts): a tela mostra as contas,
  // CNPJs e marcas de UM cliente, escolhido nas abas "Cliente:" — a conta
  // criada aqui nasce no cliente aberto.
  const grupos = await prisma.grupo.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  const pedido = (await searchParams).grupo;
  const grupoId = (grupos.find((g) => g.id === pedido) ?? grupos[0])?.id ?? null;
  // Sem grupo resolvido, nada aparece — falha fechada.
  const doGrupo = grupoId ?? "__nenhum__";

  // As marcas ativas de TODOS os grupos: os botões de marca de cada linha e o
  // "Trocar de grupo" (que marca as do grupo novo) saem daqui.
  const marcasDeTodosOsGrupos = await prisma.marca.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, grupoId: true },
  });

  // Quantas contas há em cada grupo — e fora de qualquer grupo. É o que deixa
  // conferir de relance que todo mundo está aqui: a soma das abas é o total de
  // contas do sistema (fora a de administrador e os acessos de portal).
  const contagem = await prisma.user.groupBy({
    by: ["grupoId", "ativo"],
    where: { role: { notIn: [PAPEL_PORTAL, "MASTER"] } },
    _count: { _all: true },
  });
  const contasDoGrupo = (id: string | null) =>
    contagem.filter((c) => c.grupoId === id).reduce((soma, c) => soma + c._count._all, 0);
  const totalDeContas = contagem.reduce((soma, c) => soma + c._count._all, 0);
  const totalAtivas = contagem.filter((c) => c.ativo).reduce((soma, c) => soma + c._count._all, 0);
  const semGrupo = contasDoGrupo(null);
  // Grupo inativo não tem aba; conta parada num deles conta como "fora das abas".
  const foraDasAbas =
    semGrupo +
    contagem
      .filter((c) => c.grupoId !== null && !grupos.some((g) => g.id === c.grupoId))
      .reduce((soma, c) => soma + c._count._all, 0);
  const marcasDo = (id: string) => marcasDeTodosOsGrupos.filter((m) => m.grupoId === id);
  const marcasAqui = grupoId ? marcasDo(grupoId) : [];
  const nomeDoGrupo = grupos.find((g) => g.id === grupoId)?.nome ?? "";
  const fraseDaRegra =
    marcasAqui.length === 1
      ? `${nomeDoGrupo} é um cliente de marca única: quem tem acesso vê só ${marcasAqui[0].nome}.`
      : marcasAqui.length > 1
        ? `${nomeDoGrupo} é um cliente multimarcas: cada pessoa pode ver uma marca ou várias juntas (${marcasAqui.map((m) => m.nome).join(", ")}).`
        : `O cliente ${nomeDoGrupo} ainda não tem marca ativa.`;

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
        <p className="text-sm text-muted-foreground">
          Crie, edite e desative os usuários de cada cliente. Clique numa marca, na linha da pessoa, para ligar
          ou desligar o acesso — salva na hora. O que cada um pode fazer vem dos{" "}
          <Link href="/admin/perfis" className="underline underline-offset-2 hover:text-foreground">perfis de acesso</Link>.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Cliente:</span>
          {grupos.map((g) => {
            const marcasDele = marcasDo(g.id);
            return (
              <Link
                key={g.id}
                href={`/admin/usuarios?grupo=${g.id}`}
                aria-current={g.id === grupoId ? "page" : undefined}
                title={
                  marcasDele.length === 1
                    ? `Quem está aqui vê só ${marcasDele[0].nome}.`
                    : marcasDele.length > 1
                      ? `Quem está aqui pode ver ${marcasDele.map((m) => m.nome).join(", ")} — uma, várias ou todas.`
                      : "Cliente sem marca ativa."
                }
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-1 text-sm",
                  g.id === grupoId
                    ? "border-primary bg-primary/10 font-medium"
                    : "hover:bg-muted",
                )}
              >
                {g.nome}
                <span className="rounded-full bg-muted-foreground/10 px-2 text-xs font-semibold tabular-nums">
                  {contasDoGrupo(g.id)}
                </span>
              </Link>
            );
          })}
        </div>
        {/* O tipo do cliente aberto, em português: a LM Telecom de marca única
            (quem está lá vê só ela) e o multimarcas (cada pessoa vê uma,
            várias ou todas). Vem das marcas do cliente, não de texto fixo — se
            um cliente ganhar marca, a frase acompanha. */}
        <p className="text-sm text-muted-foreground">
          {fraseDaRegra}{" "}
          Para passar alguém para outro cliente, use o botão <span className="font-medium">Trocar de cliente</span> na linha.
          Em qual cliente fica cada marca, você define em{" "}
          <Link href="/admin/clientes" className="underline underline-offset-2 hover:text-foreground">
            Clientes
          </Link>
          .
        </p>
        <p className="text-xs text-muted-foreground">
          {totalDeContas} {totalDeContas === 1 ? "conta" : "contas"} no sistema ({totalAtivas}{" "}
          {totalAtivas === 1 ? "ativa" : "ativas"}), somando todos os clientes — fora a conta de
          administrador e os acessos de portal dos colaboradores.
          {foraDasAbas > 0 && (
            <>
              {" "}
              <Link href="/admin/clientes" className="font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-300">
                {foraDasAbas === 1 ? "1 conta está" : `${foraDasAbas} contas estão`} sem cliente — ver em Clientes
              </Link>
              .
            </>
          )}
        </p>
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