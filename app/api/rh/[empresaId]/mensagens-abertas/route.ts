// Contagem de mensagens do portal ainda sem resposta, para o badge do item
// "Mensagens" no menu lateral (rh-empresa-nav.tsx).
//
// É rota de API, e não dado do layout, de propósito: o layout de /rh/<empresa>
// não re-renderiza a cada navegação do App Router, então um número calculado
// nele congelaria no valor do primeiro carregamento — mensagem nova chegando
// com o RH logado não apareceria nunca. O badge busca daqui ao montar, a cada
// troca de tela e num intervalo fixo, e por isso acompanha o banco.
//
// ESCOPO: `empresasVisiveis`, o MESMO recorte padrão da tela /mensagens (sem
// filtro `?empresas=`). O número do badge tem que bater com a lista que abre
// ao clicar nele — regra da tela de Pendências ("Contador = Lista") valendo
// aqui também.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { usuarioAlcancaEmpresa, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Sem cache: o ponto da rota é refletir o banco de agora.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // A mesma regra que decide o acesso às páginas — ver lib/rh-auth-guard.ts.
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const visiveis = await empresasVisiveis(user);
  // "Não lida" no sistema é "sem resposta": respondidaEm nulo. Coberto pelo
  // índice [empresaId, respondidaEm] do model.
  const abertas = await prisma.mensagemPortal.count({
    where: { empresaId: { in: visiveis }, respondidaEm: null },
  });

  return NextResponse.json({ abertas });
}
