import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { RHEmpresaNav } from "./rh-empresa-nav";

export default async function RHEmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/rh" className={cn("text-sm text-muted-foreground hover:underline")}>
          ← Empresas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{empresa.nome}</h1>
      </div>
      <RHEmpresaNav empresaId={empresaId} />
      {children}
    </div>
  );
}
