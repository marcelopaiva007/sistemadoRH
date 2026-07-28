import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
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
      // /vagas/<slug> é a página pública de inscrição (Fase 4). Quem acessa é
      // candidato, que por definição não tem login. O slug tem sufixo
      // aleatório e a action só aceita vaga ABERTA e publicada
      // (ver lib/actions/vagas-publico.ts). Não confundir com
      // /rh/<empresa>/vagas, que é a tela interna e continua protegida.
      if (request.nextUrl.pathname.startsWith("/vagas")) return true;
      // /carreiras é a vitrine pública: lista as vagas publicadas do grupo e
      // leva para /vagas/<slug>. Só mostra o que já é público por definição.
      if (request.nextUrl.pathname.startsWith("/carreiras")) return true;
      const isOnLogin = request.nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          role: string;
          username: string;
          empresaId: string | null;
          empresaIds: string[];
          setorId: string | null;
        };
        token.id = u.id;
        token.role = u.role;
        token.username = u.username;
        token.empresaId = u.empresaId;
        token.empresaIds = u.empresaIds ?? [];
        token.setorId = u.setorId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.username = token.username as string;
        session.user.empresaId = token.empresaId as string | null;
        session.user.empresaIds = (token.empresaIds as string[] | undefined) ?? [];
        session.user.setorId = token.setorId as string | null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
