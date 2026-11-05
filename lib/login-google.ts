import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

// LOGIN COM GOOGLE (05/11/2026, pedido do CEO): quem JÁ TEM conta no sistema
// entra com o Gmail, sem digitar senha. Não cria conta: Gmail que não está
// cadastrado é recusado — quem decide quem entra continua sendo o cadastro de
// usuários, não o Google.
//
// A ponte é o e-mail: o Google diz "este é o dono de fulano@gmail.com" (só vale
// e-mail que o Google marcou como verificado) e a conta com esse mesmo e-mail
// é quem entra. Maiúscula e minúscula não contam — o mesmo critério do login
// por usuário ou e-mail (lib/usuario-por-identificador.ts).

/** Sem as duas variáveis da credencial OAuth, o botão nem aparece. */
export function googleConfigurado(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export type MotivoRecusaGoogle = "sem-cadastro" | "mais-de-uma-conta" | "email-nao-verificado";

export type ContaDoGoogle =
  | { ok: true; userId: string }
  | { ok: false; motivo: MotivoRecusaGoogle };

/**
 * A conta que entra com este Google. Precisa ser UMA conta ativa com o e-mail
 * verificado. Duas contas com o mesmo e-mail (só a caixa das letras muda) não
 * escolhem uma ao acaso: a pessoa entra com usuário e senha até o admin deixar
 * o e-mail em uma conta só.
 */
export async function contaDoGoogle(
  email: string | null | undefined,
  emailVerificado: boolean,
): Promise<ContaDoGoogle> {
  const texto = email?.trim();
  if (!texto || !emailVerificado) return { ok: false, motivo: "email-nao-verificado" };
  const contas = await prisma.user.findMany({
    where: {
      email: { equals: texto, mode: "insensitive" },
      ativo: true,
      // Acesso de portal (funcionário sem login do sistema) não entra por
      // aqui: o portal tem porta própria (lib/portal-auth.ts).
      role: { not: PAPEL_PORTAL },
    },
    select: { id: true },
    take: 2,
  });
  if (contas.length === 0) return { ok: false, motivo: "sem-cadastro" };
  if (contas.length > 1) return { ok: false, motivo: "mais-de-uma-conta" };
  return { ok: true, userId: contas[0].id };
}

/** O texto que a tela de login mostra para cada recusa (`/login?erro=...`). */
export function mensagemDoErroDeLogin(
  erro: string | undefined,
  errorDoNextAuth: string | undefined,
): string | null {
  switch (erro) {
    case "google-sem-cadastro":
      return "Este Gmail não está cadastrado no sistema (ou a conta está desativada). Peça ao administrador para colocar este e-mail no seu usuário.";
    case "google-mais-de-uma-conta":
      return "Este e-mail está em mais de uma conta. Entre com usuário e senha, ou peça ao administrador para deixar o e-mail em uma conta só.";
    case "google-email-nao-verificado":
      return "O Google não confirmou este e-mail. Entre com usuário e senha.";
  }
  if (errorDoNextAuth) {
    return "Não foi possível entrar com o Google. Tente de novo ou entre com usuário e senha.";
  }
  return null;
}
