import Link from "next/link";
import { ChevronRight, FileText, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function RelatoriosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  return (
    <div className="space-y-4">
      {/* Navegação de Relatórios */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/rh/${empresaId}/ponto/relatorios`}>
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="w-4 h-4" />
            Fiscais (AFD/AEJ)
          </Button>
        </Link>
        <Link href={`/rh/${empresaId}/ponto/relatorios/avancados`}>
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Análise Avançada
          </Button>
        </Link>
      </div>

      {/* Conteúdo */}
      <div>{children}</div>
    </div>
  );
}
