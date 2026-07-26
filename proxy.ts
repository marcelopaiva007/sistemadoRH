import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

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
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|woff|woff2|txt|xml)$).*)",
  ],
};
