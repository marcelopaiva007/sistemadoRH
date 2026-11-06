import { requireAreaAdmin } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { GruposView } from "./grupos-view";
import { RegrasDasMarcas, type ContaNaRegra } from "./regras-das-marcas";

// REGRAS DAS MARCAS — a tela do MASTER sobre os grupos de sociedade
// (lib/grupo.ts), na área de administração desde a v1.188.0 (era
// /cadastros/grupos, dentro do sistema).
//
// Em cima, a regra de cada marca, em português (v1.190.0, pedido do CEO): "só
// ela" ou "junto com" outras — é o grupo visto pela pergunta que o dono faz.
// Embaixo, os grupos crus (nomes, contas, mover marca/conta), para o que a
// regra não cobre.
//
// Não mostra número nenhum de RH (colaboradores, folha, pendências): por
// decisão do CEO em 05/11/2026 o MASTER só administra, não enxerga o dado dos
// grupos. As contas vão com os VÍNCULOS (marca e CNPJ), não com dado de gente:
// é o que a tela precisa para dizer quem trabalha em cada marca.
export default async function GruposPage() {
  await requireAreaAdmin();

  const [grupos, marcas, usuarios] = await Promise.all([
    prisma.grupo.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true },
    }),
    prisma.marca.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        ativo: true,
        grupoId: true,
        _count: { select: { empresas: true } },
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
          <h1 className="text-2xl font-semibold tracking-tight">Regras das marcas</h1>
          <p className="max-w-3xl text-muted-foreground">
            Cada marca segue uma regra. <strong className="text-foreground">Só ela</strong>: quem
            trabalha nela não vê nenhuma outra marca (é o caso da LM Telecom).{" "}
            <strong className="text-foreground">Junto com outras</strong>: quem trabalha nela pode
            ver também as outras marcas do mesmo conjunto — uma, várias ou todas, escolhidas
            pessoa a pessoa em Usuários.
          </p>
        </div>
        <RegrasDasMarcas
          grupos={grupos}
          marcas={marcas.map((m) => ({ id: m.id, nome: m.nome, ativo: m.ativo, grupoId: m.grupoId, cnpjs: m._count.empresas }))}
          contas={contas}
        />
      </section>

      <section className="space-y-4 border-t-2 border-border pt-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Grupos e contas</h2>
          <p className="max-w-3xl text-muted-foreground">
            Por baixo das regras, cada conjunto de marcas é um grupo — uma sociedade separada.
            Nenhuma tela, relatório ou e-mail junta dois grupos: quem trabalha num grupo não vê
            as marcas do outro, nem sendo ADMIN ou Diretoria. Aqui você renomeia os grupos e vê
            em que grupo fica cada marca e cada conta. As contas são cadastradas em Usuários.
          </p>
        </div>
        <GruposView
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
    </div>
  );
}
