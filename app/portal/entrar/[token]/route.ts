// Entrada do portal: troca o link de uso único, mandado pelo bot, por uma
// sessão em cookie.
//
// É uma rota (e não uma página) de propósito — precisa gravar o cookie e
// redirecionar, e o token some da barra de endereço logo em seguida.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumirLinkDeAcesso, definirCookieDeSessao, COOKIE_SESSAO } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resultado = await consumirLinkDeAcesso(token);

  if (!resultado.ok) {
    const destino = new URL("/portal/entrada-invalida", req.nextUrl.origin);
    destino.searchParams.set("motivo", resultado.motivo);
    // Uma entrada recusada não pode conviver com uma sessão antiga aberta no
    // mesmo navegador.
    const resposta = NextResponse.redirect(destino);
    resposta.cookies.delete(COOKIE_SESSAO);
    return resposta;
  }

  await definirCookieDeSessao(resultado.sessaoToken, resultado.expiraEm);

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: resultado.colaboradorId },
    select: { nome: true, empresaId: true },
  });
  await registrarAuditoria({
    empresaId: colaborador?.empresaId ?? null,
    acao: "CRIAR",
    entidade: "PortalSessao",
    entidadeId: resultado.colaboradorId,
    resumo: "Entrou no portal pelo link do Telegram.",
    ator: {
      id: resultado.colaboradorId,
      nome: colaborador?.nome ?? "Colaborador",
      papel: "COLABORADOR",
    },
  });

  return NextResponse.redirect(new URL("/portal", req.nextUrl.origin));
}
