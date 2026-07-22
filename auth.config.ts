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
          setorId: string | null;
        };
        token.id = u.id;
        token.role = u.role;
        token.username = u.username;
        token.empresaId = u.empresaId;
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
        session.user.setorId = token.setorId as string | null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
