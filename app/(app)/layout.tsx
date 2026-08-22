import { requireUser } from "@/lib/auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AppTopbar } from "@/components/app-topbar";
import { Providers } from "@/app/providers";
// A versão vem daqui, não da barra: o commit só existe no ambiente do
// servidor, e a barra é componente de cliente.
import { versaoDoSistema } from "@/lib/versao";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // GESTOR_SETOR não navega em /rh/[empresaId] (vai direto para
  // /rh/meu-setor, sem escopo de empresa) — poupa a consulta e o seletor do
  // topo nem aparece (SeletorMarcaEmpresa some sozinho com `marcas: []`).
  let marcas: { id: string; nome: string; corPrimaria: string | null }[] = [];
  let empresas: { id: string; nome: string; marcaId: string }[] = [];
  if (user.role !== "GESTOR_SETOR") {
    const empresasDoUsuario = await empresasVisiveis(user);
    empresas = await prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario }, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, marcaId: true },
    });
    const marcasIds = [...new Set(empresas.map((e) => e.marcaId))];
    marcas = await prisma.marca.findMany({
      where: { id: { in: marcasIds } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, corPrimaria: true },
    });
  }

  return (
    <Providers>
      <div className="flex min-h-screen w-full flex-col">
        <AppTopbar
          role={user.role}
          nome={user.name ?? user.username}
          versao={versaoDoSistema().rotulo}
          marcas={marcas}
          empresas={empresas}
        />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </Providers>
  );
}
