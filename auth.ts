import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { lerCookieEmpresaAtiva, resolverEmpresaAtiva } from "@/lib/empresa-ativa";
import {
  estadoDoLogin,
  ipDaRequisicao,
  limparTentativas,
  registrarFalha,
} from "@/lib/login-tentativas";

// Hash descartável, calculado uma vez no cold start. Serve só para gastar o
// mesmo tempo de bcrypt no ramo de "usuário inexistente/inativo" que se gasta
// no ramo de usuário real — sem isso, a diferença de tempo (consulta indexada
// barata vs. um bcrypt.compare de propósito lento) revela quais usernames
// existem (enumeração por timing). O custo 10 acompanha o dos hashes reais.
const HASH_DESCARTAVEL = bcrypt.hashSync("::timing-guard::", 10);

type EmpresaNaSessao = {
  empresaId: string;
  papel: "RH_MANAGER" | "GESTOR_SETOR";
  setorId: string | null;
  papelPrincipal: boolean;
  ativo: true;
};

// auth.ts roda em Node (rotas de API e server actions). Aqui podemos usar
// Prisma para resolver a empresa ativa. A versão stub em auth.config.ts
// (Edge-safe) é sobrescrita por este callback mais completo.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const username = credentials?.username;
        const password = credentials?.password;
        // `typeof`, e não cast: o callback de credentials aceita corpo JSON, e
        // um `password` que não seja string (array, número) faz o bcrypt
        // LANÇAR em vez de devolver false. Lançar aqui muda o erro que volta
        // ao navegador (`Configuration` em vez de `CredentialsSignin`) e pula
        // o `registrarFalha` — um oráculo de "este usuário existe" em uma
        // requisição, sem medir tempo e sem gastar o balde.
        if (typeof username !== "string" || typeof password !== "string") return null;
        if (!username || !password) return null;

        const ip = ipDaRequisicao(request.headers);

        // Barrar ANTES do bcrypt é o ponto todo: comparar hash é caro de
        // propósito, e é isso que faz tentativa em massa virar carga no
        // servidor. Tentativa barrada custa uma consulta indexada.
        //
        // Falha aberta se o banco reclamar — mesmo critério do
        // `ultimoAcessoEm` logo abaixo. Login é caminho quente: ninguém pode
        // ficar de fora do sistema porque a tabela de tentativas engasgou.
        const estado = await estadoDoLogin(username, ip).catch(() => null);
        if (estado?.bloqueado) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        // Usuário inexistente e usuário desativado contam como falha. O
        // primeiro é justamente o caso de quem está adivinhando nome de
        // usuário, e é o que não teria onde ser contado se o contador
        // morasse numa coluna de `User`.
        if (!user || !user.ativo) {
          // Gasta o mesmo tempo de bcrypt do caminho de usuário real, para que
          // "usuário não existe" e "senha errada" respondam em tempo
          // indistinguível (fecha a enumeração por timing).
          await bcrypt.compare(password, HASH_DESCARTAVEL).catch(() => false);
          await registrarFalha(username, ip).catch(() => {});
          return null;
        }

        // Mesmo `.catch` do ramo de usuário inexistente: um hash malformado
        // no banco vira "senha errada" (contada), não erro de configuração.
        const valid = await bcrypt.compare(password, user.passwordHash).catch(() => false);
        if (!valid) {
          await registrarFalha(username, ip).catch(() => {});
          return null;
        }

        // Entrou: o balde zera, senão quem errou 4 vezes e acertou na quinta
        // continuaria a um passo do bloqueio pelos 15 minutos seguintes.
        limparTentativas(username, ip).catch(() => {});

        // Marca último acesso — separado do `update` para que erro de DB não
        // quebre o login (login é caminho quente, não pode falhar por causa
        // de telemetria).
        prisma.user
          .update({ where: { id: user.id }, data: { ultimoAcessoEm: new Date() } })
          .catch(() => {});

        // Carrega pivô UserEmpresa para injetar no JWT via callback `jwt`.
        // Apenas ativos — desativados caem fora da sessão.
        const vinculos = await prisma.userEmpresa.findMany({
          where: { userId: user.id, ativo: true },
          orderBy: [{ papelPrincipal: "desc" }, { createdAt: "asc" }],
          select: { empresaId: true, role: true, setorId: true, papelPrincipal: true },
        });

        return {
          id: user.id,
          name: user.nome,
          username: user.username,
          email: user.email,
          ativo: user.ativo,
          role: user.role,
          empresas: vinculos.map((v) => ({
            empresaId: v.empresaId,
            papel: v.role as "RH_MANAGER" | "GESTOR_SETOR",
            setorId: v.setorId,
            papelPrincipal: v.papelPrincipal,
            ativo: true as const,
          })),
        };
      },
    }),
  ],
  callbacks: {
    // Mantém `authorized`/`session` do config; sobrescreve só `jwt`.
    authorized: authConfig.callbacks!.authorized!,
    session: authConfig.callbacks!.session!,
    async jwt({ token, user }) {
      // Reaplica tudo do token existente (campos spreads pelo NextAuth).
      const next = { ...token };

      if (user) {
        // Login fresco: copiar tudo que o `authorize` trouxe.
        const u = user as {
          id: string;
          role: string;
          username: string;
          email: string | null;
          ativo: boolean;
          empresas: EmpresaNaSessao[];
        };
        next.id = u.id;
        next.role = u.role;
        next.username = u.username;
        next.email = u.email;
        next.ativo = u.ativo;
        next.empresas = u.empresas;
      }

      // Resolver empresa ativa: lê cookie, valida contra pivô.
      // Chamado em todo request — cookie pode ter mudado desde o login
      // (troca de empresa via UI em `trocarEmpresaAtiva`).
      const cookie = await lerCookieEmpresaAtiva();
      const empresas = (next.empresas as EmpresaNaSessao[] | undefined) ?? [];
      if (empresas.length === 0) {
        next.empresaAtivaId = null;
        next.setorAtivaId = null;
        next.empresaId = null;
        next.setorId = null;
      } else {
        const ativa = await resolverEmpresaAtiva(next.id as string, cookie);
        next.empresaAtivaId = ativa?.empresaId ?? null;
        next.setorAtivaId = ativa?.setorId ?? null;
        // Legado: Fase 8 remove esses campos.
        next.empresaId = ativa?.empresaId ?? null;
        next.setorId = ativa?.setorId ?? null;
      }

      return next;
    },
  },
});
