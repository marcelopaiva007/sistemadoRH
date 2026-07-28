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

// Quem abre o link não é sempre a pessoa. Mensageiros e redes sociais buscam a
// URL para montar o card de preview, e navegadores às vezes pré-carregam — cada
// um desses acessos queimava o token de uso único antes de o colaborador tocar
// na tela. Era o que fazia todo mundo ver "esse link já foi usado".
//
// Estes acessos recebem 204 e não consomem nada. Um humano nunca chega aqui
// com essas marcas: navegador de verdade manda `sec-fetch-mode: navigate`.
function ehAcessoAutomatico(req: NextRequest): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  const robos = [
    "telegrambot", "whatsapp", "facebookexternalhit", "slackbot", "discordbot",
    "twitterbot", "linkedinbot", "skypeuripreview", "bot", "crawler", "spider",
    "preview", "curl", "wget", "python-requests", "headless",
  ];
  if (robos.some((r) => ua.includes(r))) return true;

  // Prefetch/prerender do navegador — Chrome, Safari e Next mandam um destes.
  const proposito = [
    req.headers.get("purpose"),
    req.headers.get("x-purpose"),
    req.headers.get("sec-purpose"),
    req.headers.get("x-moz"),
    req.headers.get("next-router-prefetch"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return proposito.includes("prefetch") || proposito.includes("preview") || proposito.includes("prerender");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (ehAcessoAutomatico(req)) {
    // 204 e nada mais: sem corpo não há o que pôr no card, e o token segue
    // válido esperando a pessoa.
    return new NextResponse(null, { status: 204 });
  }

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
