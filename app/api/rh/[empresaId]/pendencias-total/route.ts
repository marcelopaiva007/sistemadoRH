// Total de pendências do CNPJ aberto, para o contador do item "Pendências" no
// topo da lateral (components/padroes/nav-lateral.tsx, via rh-empresa-nav.tsx).
//
// Rota de API pelo mesmo motivo de mensagens-abertas: o layout de /rh/<empresa>
// não re-renderiza a cada navegação do App Router, e um número calculado nele
// congelaria no primeiro carregamento. Diferente do badge de Mensagens, este
// NÃO faz polling: `pendenciasDaEmpresa` são ~27 consultas agrupadas — uma
// busca por CNPJ aberto basta, e a tela de Pendências segue sendo a verdade.
//
// ESCOPO: só o CNPJ do caminho (sem `?empresas=`).
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { pendenciasDaEmpresa, totalPendencias } from "@/lib/pendencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const total = totalPendencias(await pendenciasDaEmpresa([empresaId]));
  return NextResponse.json({ total });
}
