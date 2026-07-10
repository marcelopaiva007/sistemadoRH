import { requireUser } from "@/lib/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { Providers } from "@/app/providers";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <Providers>
      <div className="flex min-h-screen w-full">
        <AppSidebar role={user.role} nome={user.name ?? user.username} />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </Providers>
  );
}
