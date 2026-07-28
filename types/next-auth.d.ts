import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      username: string;
      empresaId: string | null;
      empresaIds: string[];
      setorId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    username: string;
    empresaId: string | null;
    empresaIds: string[];
    setorId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    username: string;
    empresaId: string | null;
    empresaIds: string[];
    setorId: string | null;
  }
}
