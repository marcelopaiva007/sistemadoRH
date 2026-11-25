import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/auth";

// CONFERE A SESSÃO E ACERTA O COOKIE (25/11/2026).
//
// Desde 25/11/2026 o callback `jwt` (auth.ts) relê o usuário a cada requisição
// e recusa a sessão de conta desativada ou de senha trocada depois do login.
// Só que quem recusa, numa página, é o `auth()` de Server Component — e ali o
// NextAuth não consegue apagar o cookie (página não grava cookie). O proxy,
// que roda antes e não lê o banco, continua vendo o cookie como válido. Sem
// esta rota: a página manda para /login, o proxy vê "logado" e devolve para
// "/", a página manda para /login... em círculo, até o navegador desistir.
//
// Aqui é rota de API (fora do proxy, ver o `matcher` em proxy.ts) e rota PODE
// gravar cookie. Ela pede ao próprio NextAuth a sessão (`GET
// /api/auth/session`, o mesmo que o SessionProvider do navegador chama), que
// passa pelo callback `jwt` e devolve os cookies certos:
//   - sessão recusada: o cookie é APAGADO (lib/actions/session.js do
//     @auth/core, ramo `token === null`), e o login abre normalmente;
//   - sessão válida: o cookie é REGRAVADO com papel e vínculos de agora — o
//     que também destrava o proxy quando ele decidia por um papel velho (ex.:
//     conta que deixou de ser MASTER e o proxy ainda mandava para /admin).
//
// Não desloga ninguém por conta própria: só apaga o cookie se o NextAuth
// recusar a sessão. Um link para cá, aberto por quem está logado de verdade,
// só regrava o mesmo cookie e leva ao login, que o proxy devolve para a home.
export async function GET(request: NextRequest) {
  const urlSessao = new URL("/api/auth/session", request.url);
  const resposta = await handlers.GET(new NextRequest(urlSessao, { headers: request.headers }));

  // Destino fixo, escolhido por chave e não por endereço: nada de `?volta=`
  // livre aqui, para a rota não virar redirecionamento aberto.
  const destino = request.nextUrl.searchParams.get("para") === "admin" ? "/admin/login" : "/login";
  const saida = NextResponse.redirect(new URL(destino, request.url));
  for (const cookie of resposta.headers.getSetCookie()) saida.headers.append("set-cookie", cookie);
  saida.headers.set("Cache-Control", "private, no-store");
  return saida;
}
