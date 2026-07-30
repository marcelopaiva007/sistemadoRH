import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gerarCsv } from "@/lib/csv";
import { COLUNAS_MODELO } from "@/lib/importacao-colaboradores";

export const runtime = "nodejs";

// Modelo de planilha de colaboradores: BOM UTF-8 + ponto e vírgula, para o
// Excel pt-BR abrir certo com dois cliques. A linha de exemplo mostra o
// formato de cada campo — quem preenche apaga a linha ou escreve por cima.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
  if (!autorizado) return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });

  const exemplo = [
    "Maria Souza Lima",
    "111.444.777-35",
    "2026001",
    "Comercial",
    "Vendedora",
    "maria@exemplo.com",
    "(86) 99999-0000",
    "01/03/2026",
    "15/07/1995",
    "2500,00",
    "CLT",
  ];

  const csv = gerarCsv([...COLUNAS_MODELO], [exemplo]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-colaboradores.csv"',
    },
  });
}
