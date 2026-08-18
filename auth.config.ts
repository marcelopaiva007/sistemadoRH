import type { NextAuthConfig } from "next-auth";

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
      // "Esqueci minha senha": pedir o link e redefinir com o token são as
      // duas telas que, por definição, quem não consegue logar precisa
      // acessar sem estar logado.
      if (request.nextUrl.pathname.startsWith("/esqueci-senha")) return true;
      if (request.nextUrl.pathname.startsWith("/redefinir-senha")) return true;
      const isOnLogin = request.nextUrl.pathname.startsWith("/login");
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