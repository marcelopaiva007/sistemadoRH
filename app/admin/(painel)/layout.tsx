import type { ReactNode } from "react";
import { requireAreaAdmin } from "@/lib/grupo-guard";
import { versaoDoSistema } from "@/lib/versao";
import { AdminTopbar } from "./admin-topbar";

// O painel da área de administração: a barra própria (escura, com "Admin" ao
// lado da logo — para nunca se confundir com o sistema) e as telas de contas.
//
// O portão aqui é o mesmo de cada página (`requireAreaAdmin`). Os dois existem
// porque layout e página renderizam em paralelo no App Router: a guarda do
// layout sozinha não segura a página — quem segura é a da própria página.
export default async function PainelAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAreaAdmin();
  const versao = versaoDoSistema();
  return (
    <div className="flex min-h-screen w-full flex-col">
      <AdminTopbar
        nome={admin.name ?? admin.username}
        usuario={admin.username}
        versao={versao.rotulo}
        versaoCurta={`v${versao.numero}`}
      />
      {/* Mesmo recorte lateral do <main> do sistema (app/(app)/layout.tsx):
          `clip` corta o que transborda sem criar rolagem. */}
      <main className="flex-1 overflow-x-hidden p-6 supports-[overflow:clip]:overflow-x-clip">{children}</main>
    </div>
  );
}
