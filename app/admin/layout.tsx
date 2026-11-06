import type { Metadata } from "next";
import type { ReactNode } from "react";

// ÁREA DE ADMINISTRAÇÃO — rh.assinelm.com/admin (v1.188.0).
//
// Uma tela SEPARADA do sistema, pedida pelo CEO em 05/11/2026: endereço,
// login e barra próprios, sem nada do RH à vista. Mora fora do grupo `(app)`
// de propósito — não herda a barra de topo do sistema, o seletor de marca nem
// a navegação dos módulos. Só a conta MASTER entra (lib/grupo-guard.ts,
// `requireAreaAdmin`; o proxy confere antes, em auth.config.ts).
//
// Dois ramos aqui dentro:
//   - login/      → a porta, pública;
//   - (painel)/   → Usuários, Grupos, Perfis de acesso e a senha da conta,
//                   atrás do portão do MASTER (o layout do grupo).
export const metadata: Metadata = {
  title: "FASTMAI | Admin",
  description: "Área de administração do sistema — contas, grupos e perfis de acesso.",
  // Endereço de administração não tem por que aparecer em buscador.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
