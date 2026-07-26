import { requireUser } from "@/lib/auth-guard";
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

  return (
    <Providers>
      <div className="flex min-h-screen w-full flex-col">
        <AppTopbar
          role={user.role}
          nome={user.name ?? user.username}
          versao={versaoDoSistema().rotulo}
        />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </Providers>
  );
}
