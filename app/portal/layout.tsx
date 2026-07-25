import { Logo } from "@/components/logo";

// O portal é a única parte do sistema feita para o celular do colaborador em
// campo: coluna única, alvos de toque grandes, sem menu lateral.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
          <Logo width={150} height={39} className="h-7 w-auto" />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Portal do colaborador
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
