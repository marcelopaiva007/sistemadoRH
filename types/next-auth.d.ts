import "next-auth";

type EmpresaNaSessao = {
  empresaId: string;
  papel: "RH_MANAGER" | "GESTOR_SETOR";
  setorId: string | null;
  papelPrincipal: boolean;
  ativo: true;
};

// Estender `DefaultSession["user"]` (e não `Session["user"]`) evita conflito
// com o AdapterUser interno do next-auth, que força `email: string`. Ao
// acrescentar os campos no nível mais interno, mantemos `string | null` no
// email que veio da nossa extension.
declare module "next-auth" {
  interface DefaultSession {
    user?: {
      id: string;
      role: string;
      username: string;
      email: string | null;
      ativo: boolean;
      empresas: EmpresaNaSessao[];
      empresaAtivaId: string | null;
      setorAtivaId: string | null;
      // Legado.
      empresaId: string | null;
      setorId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    username: string;
    email: string | null;
    ativo: boolean;
    empresas: EmpresaNaSessao[];
    empresaAtivaId?: string | null;
    setorAtivaId?: string | null;
    empresaId?: string | null;
    setorId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    username: string;
    email: string | null;
    ativo: boolean;
    empresas: EmpresaNaSessao[];
    empresaAtivaId: string | null;
    setorAtivaId: string | null;
    empresaId: string | null;
    setorId: string | null;
  }
}

// O AdapterUser interno do next-auth v5 força `email: string` (não nullable).
// Em `authorize`, isso conflita com nosso User.email nullable. Como usamos só
// Credentials (sem adapter), sobrescrevemos o AdapterUser para também aceitar
// null. Não toca em nada de runtime — é só type-level.
declare module "@auth/core/adapters" {
  interface AdapterUser {
    email: string | null;
  }
}