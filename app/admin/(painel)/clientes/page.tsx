import { requireAreaAdmin } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { ClientesView } from "./clientes-view";
import { RegrasDasMarcas, type ContaNaRegra } from "./regras-das-marcas";

// CLIENTES — a tela de entrada da GESTÃO FASTMAI (v1.192.0, pedido do CEO em
// 05/11/2026): a FASTMAI é a dona do sistema e tem clientes. A LM Telecom é um
// cliente de MARCA ÚNICA; as demais empresas formam um cliente MULTIMARCAS. A
// FASTMAI controla os usuários de cada cliente.
//
// No banco, cliente é o GRUPO de sociedade (lib/grupo.ts) — nada mudou de
// estrutura, só o nome com que a Gestão o apresenta. O tipo sai das marcas
// ativas: uma = marca única; duas ou mais = multimarcas.
//
// Era /admin/grupos ("Regras das marcas", v1.190.0); o endereço antigo leva
// para cá (next.config.ts). Embaixo dos cartões, a tabela de marcas: em qual
// cliente fica cada uma — é a antiga regra "só ela" / "junto com".
//
// Não mostra número nenhum de RH (colaboradores, folha, pendências): por
// decisão do CEO em 05/11/2026 a Gestão só administra, não enxerga o dado dos
// clientes. As contas vão com os VÍNCULOS (marca e CNPJ), não com dado de
// gente: é o que a tela precisa para dizer quem trabalha em cada marca.
export default async function ClientesPage() {
  await requireAreaAdmin();

  const [grupos, marcas, usuarios] = await Promise.all([
    prisma.grupo.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        ativo: true,
        razaoSocial: true,
        cnpj: true,
        responsavelNome: true,
        contatoEmail: true,
        contatoTelefone: true,
        plano: true,
        limiteUsuarios: true,
        inicioContrato: true,
        observacoes: true,
      },
    }),
    prisma.marca.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        ativo: true,
        grupoId: true,
        _count: { select: { empresas: true } },
        // As EMPRESAS do cliente (v1.197.0): cada CNPJ com os seus dados.
        // Dado cadastral de empresa, não de gente — a Gestão segue sem ver RH.
        empresas: {
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, cnpj: true, razaoSocial: true, ativo: true },
        },
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
        marcas: { where: { ativo: true }, select: { marcaId: true, role: true } },
        empresas: { where: { ativo: true }, select: { empresa: { select: { marcaId: true } } } },
      },
    }),
  ]);

  const contas: ContaNaRegra[] = usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    username: u.username,
    role: u.role,
    ativo: u.ativo,
    grupoId: u.grupoId,
    restricoes: u.marcas
      .filter((v) => v.role === "ADMIN" || v.role === "DIRETORIA")
      .map((v) => v.marcaId),
    marcas: u.marcas.map((v) => v.marcaId),
    marcasDosCnpjs: [...new Set(u.empresas.map((v) => v.empresa.marcaId))],
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="max-w-3xl text-muted-foreground">
            Os clientes da FASTMAI, cada um com as suas marcas e os seus usuários. Um cliente de{" "}
            <strong className="text-foreground">marca única</strong> (como a LM Telecom) só vê a
            própria marca; num cliente <strong className="text-foreground">multimarcas</strong>, cada
            pessoa vê uma, várias ou todas as marcas dele. Nada de um cliente aparece para outro —
            nem para quem é ADMIN ou Diretoria. Os usuários de cada cliente você gerencia no botão{" "}
            <strong className="text-foreground">Usuários</strong> do cartão.
          </p>
        </div>
        <ClientesView
          grupos={grupos}
          marcas={marcas}
          usuarios={usuarios.map((u) => ({
            id: u.id,
            nome: u.nome,
            username: u.username,
            role: u.role,
            ativo: u.ativo,
            grupoId: u.grupoId,
          }))}
        />
      </section>

      <section id="marcas" className="space-y-4 border-t-2 border-border pt-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Marcas e clientes</h2>
          <p className="max-w-3xl text-muted-foreground">
            Em qual cliente fica cada marca. Uma marca pode virar um{" "}
            <strong className="text-foreground">cliente só dela</strong> (marca única: quem trabalha
            nela não vê outra) ou passar para um{" "}
            <strong className="text-foreground">cliente multimarcas</strong> (quem trabalha nela pode
            ver também as outras marcas do cliente, escolhidas pessoa a pessoa em Usuários). Antes de
            confirmar, a tela mostra quem vai junto e quem deixa de ver a marca.
          </p>
        </div>
        <RegrasDasMarcas
          grupos={grupos}
          marcas={marcas.map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativo, grupoId: m.grupoId, cnpjs: m._count.empresas }))}
          contas={contas}
        />
      </section>
    </div>
  );
}
