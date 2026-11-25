import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { direcaoRestrita } from "@/lib/grupo";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { areasProcessosPermitidas } from "@/lib/telas";
import { prisma } from "@/lib/prisma";
import { AppTopbar } from "@/components/app-topbar";
import { Providers } from "@/app/providers";
// A versão vem daqui, não da barra: o commit só existe no ambiente do
// servidor, e a barra é componente de cliente.
import { versaoDoSistema } from "@/lib/versao";
import { enderecoDaAreaAdmin } from "@/lib/area-admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // O MASTER administra contas e grupos e não abre dado de RH (lib/grupo.ts):
  // desde a v1.188.0 o lugar dele é a área de administração, fora do sistema.
  if (user.role === "MASTER") redirect("/admin");
  // As perguntas abaixo não dependem umas das outras: vão juntas ao banco. Em
  // sequência eram 8 a 9 idas e voltas antes de a página começar a renderizar.
  type MarcaDoTopo = { id: string; nome: string; corPrimaria: string | null; logoUrl: string | null };
  type EmpresaDoTopo = { id: string; nome: string; marcaId: string };
  const [sistemas, areasProcessos, restrita, seletor] = await Promise.all([
    sistemasPermitidos(user),
    // Frota e Contratos são abas do mesmo módulo; o admin pode liberar só uma (lib/telas.ts).
    areasProcessosPermitidas(user.id),
    direcaoRestrita(user),
    // GESTOR_SETOR não navega em /rh/[empresaId] (vai direto para
    // /rh/meu-setor, sem escopo de empresa) — poupa a consulta e o seletor do
    // topo nem aparece (SeletorMarcaEmpresa some sozinho com `marcas: []`).
    user.role === "GESTOR_SETOR"
      ? Promise.resolve({ marcas: [] as MarcaDoTopo[], empresas: [] as EmpresaDoTopo[] })
      : empresasVisiveis(user).then(async (empresasDoUsuario) => {
          // Empresa e marca numa consulta só (antes eram duas em sequência).
          const linhas = await prisma.empresa.findMany({
            where: { id: { in: empresasDoUsuario }, ativo: true },
            orderBy: { nome: "asc" },
            select: {
              id: true,
              nome: true,
              marcaId: true,
              marca: { select: { id: true, nome: true, corPrimaria: true, logoUrl: true } },
            },
          });
          const porMarca = new Map<string, MarcaDoTopo>();
          for (const l of linhas) porMarca.set(l.marca.id, l.marca);
          return {
            empresas: linhas.map(({ id, nome, marcaId }) => ({ id, nome, marcaId })),
            marcas: [...porMarca.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
          };
        }),
  ]);
  const { marcas, empresas } = seletor;

  return (
    <Providers>
      <div className="flex min-h-screen w-full flex-col">
        <AppTopbar
          role={user.role}
          nome={user.name ?? user.username}
          usuario={user.username}
          versao={versaoDoSistema().rotulo}
          versaoCurta={`v${versaoDoSistema().numero}`}
          marcas={marcas}
          empresas={empresas}
          sistemasPermitidos={sistemas}
          areasProcessos={areasProcessos}
          direcaoRestrita={restrita}
          enderecoAdmin={
            user.role === "ADMIN" || user.role === "DIRETORIA" ? enderecoDaAreaAdmin() : null
          }
        />
        {/* `overflow-x-clip`, e não `hidden`, onde o navegador entende `clip`.
            `hidden` num eixo força o outro a `auto` e transforma o <main> em
            contêiner de rolagem — e aí o `sticky` das laterais (RH, Processos,
            Delegações) passava a valer em relação ao <main>, que nunca rola:
            até a v1.182.0 a lateral rolava junto com a página e começava 52px
            mais baixa, com o fim dela abaixo da dobra. `clip` corta o que
            transborda de lado sem criar rolagem. `hidden` fica de reserva para
            Safari antigo (anterior ao 16). */}
        <main className="flex-1 overflow-x-hidden p-6 supports-[overflow:clip]:overflow-x-clip">{children}</main>
      </div>
    </Providers>
  );
}
