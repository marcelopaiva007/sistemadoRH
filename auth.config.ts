import type { NextAuthConfig } from "next-auth";
import { CAMINHO_PADRAO_DO_ADMIN, voltaDoAdmin } from "@/lib/admin-volta";

// Configuração Edge-safe: importada tanto pelo middleware (proxy.ts) quanto
// pelo handler de auth (auth.ts). NÃO pode usar Prisma aqui — middleware
// roda em Edge runtime e o client Prisma não funciona.
//
// A parte "pesada" (resolver empresa ativa via banco, ler cookies com
// query ao Prisma) vive no callback `jwt` definido em auth.ts, que sobrescreve
// este stub.
export const authConfig = {
  pages: {
    signIn: "/login",
    // Erro do próprio NextAuth (configuração, callback) volta para a tela de
    // login com `?error=`, e não para a página de erro em inglês do NextAuth.
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      // /responder/<token> é público por design: o colaborador acessa pelo
      // link do convite, sem login — a autorização é o próprio token
      // imprevisível (ver lib/actions/pesquisas-publico.ts).
      if (request.nextUrl.pathname.startsWith("/responder")) return true;
      // /portal tem autenticação PRÓPRIA, fora do NextAuth: o colaborador não
      // tem usuário no sistema, entra pelo link de uso único do bot do Telegram
      // e a sessão vive no cookie portal_sessao (ver lib/portal-auth.ts).
      // Passar pelo NextAuth aqui só mandaria o colaborador para uma tela de
      // login que não é dele.
      if (request.nextUrl.pathname.startsWith("/portal")) return true;
      // /ponto é o app de bater ponto do colaborador — autenticação própria
      // por CPF + PIN (cookie ponto_sessao, ver lib/ponto-pin-auth.ts), fora
      // do NextAuth pelo mesmo motivo do /portal: colaborador não tem usuário
      // no sistema.
      if (request.nextUrl.pathname.startsWith("/ponto")) return true;
      // /vagas/<slug> é a página pública de inscrição (Fase 4). Quem acessa é
      // candidato, que por definição não tem login. O slug tem sufixo
      // aleatório e a action só aceita vaga ABERTA e publicada
      // (ver lib/actions/vagas-publico.ts). Não confundir com
      // /rh/<empresa>/vagas, que é a tela interna e continua protegida.
      if (request.nextUrl.pathname.startsWith("/vagas")) return true;
      // /carreiras é a vitrine pública: lista as vagas publicadas do grupo e
      // leva para /vagas/<slug>. Só mostra o que já é público por definição.
      if (request.nextUrl.pathname.startsWith("/carreiras")) return true;
      // /assinar/<token> é o fluxo público de assinatura de contracheques:
      // o colaborador acessa pelo link recebido por e-mail, sem login no sistema
      // — a autorização é o próprio token e a conferência de CPF (ver lib/actions/assinatura-contracheque.ts).
      if (request.nextUrl.pathname.startsWith("/assinar")) return true;
      // "Esqueci minha senha" e "Esqueci meu usuário": pedir o link, redefinir
      // com o token e receber o usuário por e-mail são as telas que, por
      // definição, quem não consegue logar precisa acessar sem estar logado.
      if (request.nextUrl.pathname.startsWith("/esqueci-senha")) return true;
      if (request.nextUrl.pathname.startsWith("/esqueci-usuario")) return true;
      if (request.nextUrl.pathname.startsWith("/redefinir-senha")) return true;
      // ÁREA DE ADMINISTRAÇÃO (app/admin, v1.188.0): endereço, login e tela
      // próprios, só da conta MASTER. O login do admin é público — e quem já
      // está como MASTER vai direto para o painel. O resto de /admin exige o
      // MASTER; sem ele, volta para o login DO ADMIN (não o do sistema), que
      // explica com que conta a pessoa está e oferece trocar.
      // As páginas conferem de novo no servidor (requireAreaAdmin): isto aqui
      // é o atalho, não a única tranca.
      const caminho = request.nextUrl.pathname;
      const ehMaster = isLoggedIn && auth?.user?.role === "MASTER";
      if (caminho === "/admin/login" || caminho.startsWith("/admin/login/")) {
        if (!ehMaster) return true;
        // Já é o MASTER: segue para onde ia (`?volta=`, só dentro de /admin).
        const volta = voltaDoAdmin(request.nextUrl.searchParams.get("volta"));
        return Response.redirect(new URL(volta ?? CAMINHO_PADRAO_DO_ADMIN, request.nextUrl));
      }
      if (caminho === "/admin" || caminho.startsWith("/admin/")) {
        if (ehMaster) return true;
        // Guarda o destino (inclusive a query, como o ?grupo= de Usuários)
        // para o login do admin devolver a pessoa ao mesmo lugar.
        const login = new URL("/admin/login", request.nextUrl);
        const volta = voltaDoAdmin(caminho + request.nextUrl.search);
        if (volta) login.searchParams.set("volta", volta);
        return Response.redirect(login);
      }
      // O MASTER não usa o sistema do RH: qualquer outra tela (o login do
      // sistema inclusive) o leva à área de admin. Fica AQUI, no proxy, e não
      // só no layout do sistema: layout do App Router não roda de novo na
      // navegação dentro do app, e uma aba aberta como Diretoria seguia
      // navegando pelo RH depois que outra aba entrava como MASTER (achado da
      // revisão da v1.188.0). O proxy roda em toda requisição.
      if (ehMaster) return Response.redirect(new URL(CAMINHO_PADRAO_DO_ADMIN, request.nextUrl));
      const isOnLogin = caminho.startsWith("/login");
      if (isOnLogin) {
        return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }
      return isLoggedIn;
    },
    // Stub: auth.ts sobrescreve este callback com a versão completa que tem
    // acesso a Prisma. Manter aqui só para satisfazer o tipo NextAuthConfig.
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      // Não popula empresaAtivaId/setorAtivaId aqui — vem do callback `jwt`
      // em auth.ts (Node runtime).
      if (session.user) {
        const u = session.user as unknown as {
          id: string;
          role: string;
          username: string;
          email: string | null;
          ativo: boolean;
          empresas: unknown[];
          empresaAtivaId: string | null;
          setorAtivaId: string | null;
          empresaId: string | null;
          setorId: string | null;
        };
        u.id = token.id as string;
        u.role = token.role as string;
        u.username = token.username as string;
        u.email = (token.email as string | null | undefined) ?? null;
        u.ativo = (token.ativo as boolean) ?? true;
        u.empresas = (token.empresas as unknown[]) ?? [];
        u.empresaAtivaId = (token.empresaAtivaId as string | null) ?? null;
        u.setorAtivaId = (token.setorAtivaId as string | null) ?? null;
        u.empresaId = (token.empresaId as string | null) ?? null;
        u.setorId = (token.setorId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;