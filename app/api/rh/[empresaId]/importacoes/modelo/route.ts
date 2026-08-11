import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
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
  // Uma linha, uma regra: `usuarioAlcancaEmpresa` de lib/rh-auth-guard.ts, a
  // MESMA que decide o acesso às páginas. Aqui havia uma checagem escrita à
  // mão — cinco variantes diferentes conviviam em nove rotas, e duas delas
  // esqueciam DIRETORIA, cujo pivô `UserEmpresa` é vazio por desenho.
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

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
