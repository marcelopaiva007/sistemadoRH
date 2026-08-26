import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// O endereço do sistema é UM: rh.assinelm.com. Os domínios *.vercel.app de
// produção continuam existindo (a Vercel não deixa removê-los), mas quem cair
// neles é devolvido para o canônico com caminho e query intactos.
//
// Por que isso importa: o NextAuth monta os redirects de login a partir da env
// NEXTAUTH_URL — se ela apontar para o domínio vercel, quem entra por
// rh.assinelm.com é jogado para sistemado-rh-two.vercel.app no primeiro
// redirect (foi o defeito relatado em 26/08/2026). A canonização aqui garante
// o endereço certo MESMO se a env estiver errada; a env certa
// (NEXTAUTH_URL=https://rh.assinelm.com) elimina os saltos extras.
//
// Previews (sistemado-rh-git-*.vercel.app) ficam de fora do conjunto de
// propósito: preview é para ser acessado pelo endereço de preview.
const HOST_CANONICO = "rh.assinelm.com";
const HOSTS_SECUNDARIOS = new Set([
  "sistemado-rh-two.vercel.app",
  "sistemado-rh-marcelopaiva007s-projects.vercel.app",
]);

export default function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && HOSTS_SECUNDARIOS.has(host)) {
    const destino = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      `https://${HOST_CANONICO}`,
    );
    // 308: permanente e preserva o método — POST de formulário não vira GET.
    return NextResponse.redirect(destino, 308);
  }
  // Daqui em diante, o guarda de autenticação de sempre.
  return (auth as unknown as (req: NextRequest) => Response | Promise<Response>)(request);
}

export const config = {
  // Além das rotas internas do Next, os arquivos de `public/` precisam ficar
  // de fora: eles são servidos na RAIZ (/lm-telecom-logo.png), não sob
  // _next/, então sem esta exclusão o guarda de autenticação os intercepta e
  // devolve um redirecionamento para /login no lugar da imagem.
  //
  // Isso deixou o logo oficial quebrado em TODA página pública — carreiras,
  // login, inscrição em vaga, portal do colaborador — para quem não estivesse
  // logado. O componente Logo usa `unoptimized`, então a imagem não passa por
  // _next/image, que já era excluído; ia direto pela raiz.
  //
  // Extensões listadas em vez de "qualquer coisa com ponto": é explícito
  // sobre o que se pretende liberar, e nenhuma rota do sistema tem ponto.
  //
  // sw.js (nome exato, não a extensão .js inteira) e webmanifest entraram em
  // 17/08/2026: sem eles o guarda respondia redirect para /login no lugar do
  // service worker e do manifesto para quem não estava logado no sistema —
  // e a instalação do PWA do portal falhava em silêncio (o register() tem
  // .catch vazio de propósito).
  //
  // /login SAIU da exclusão em 26/08/2026: a canonização de host precisa
  // valer também nela (era justamente onde o usuário parava no domínio
  // errado). O authorized() do auth.config já trata /login explicitamente
  // (anônimo entra; logado volta para a home), então não há loop.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|woff|woff2|txt|xml|webmanifest)$).*)",
  ],
};
