import type { ReactNode } from "react";
import { CadastrosTabs } from "./cadastros-tabs";
import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { ehMaster } from "@/lib/grupo";

// O cadastro ÚNICO de acesso do grupo — usuários e perfis, para OS DOIS
// sistemas (RH e Processos & Ativos), fora de qualquer módulo. É o perfil,
// na sua matriz, que decide se o acesso cobre os dois sistemas ou só telas
// de um; por isso não existe "usuário do RH" e "usuário do Processos" — e
// este layout é o que garante que as duas telas se apresentem como uma área
// só, alcançada pelo item "Usuários e perfis" da barra de topo.
export default async function CadastrosLayout({
  children,
}: {
  children: ReactNode;
}) {
  const quem = await requireGestaoUsuarios();
  return (
    <div className="space-y-6">
      <CadastrosTabs master={ehMaster(quem)} />
      {children}
    </div>
  );
}
