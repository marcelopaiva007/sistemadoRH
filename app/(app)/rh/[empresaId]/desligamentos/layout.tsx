import { Suspense } from "react";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { AbasDesligamentos } from "./abas-desligamentos";

/**
 * Área Desligamentos (Gestão), v1.215.0 — um lugar só para o assunto, pedido
 * do CEO em 25/11/2026: o painel de meta, custo, setores e gestores, e a lista
 * operacional de saídas (checklist, entrevista, prazos), que antes ficava
 * sozinha em Ciclo de vida. Cada página tem o próprio título; o layout só
 * carrega as abas.
 */
export default async function DesligamentosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  return (
    <div className="space-y-6">
      {/* useSearchParams nas abas pede Suspense no layout (o resto da página
          continua renderizando no servidor). */}
      <Suspense fallback={<div className="h-10 border-b" />}>
        <AbasDesligamentos base={`/rh/${empresaId}/desligamentos`} />
      </Suspense>
      {children}
    </div>
  );
}
