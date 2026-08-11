import { prisma } from "@/lib/prisma";
import { cifrar, decifrar } from "@/lib/cripto";

export const CHAVE_ANTHROPIC = "ANTHROPIC_API_KEY";
export const CHAVE_TELEGRAM = "TELEGRAM_BOT_TOKEN";

// SMTP é multi-campo — cinco linhas em SegredoApp em vez de uma. Host, porta,
// usuário e remetente não são segredo de verdade (aparecem em qualquer
// cabeçalho de e-mail recebido); só a senha é. Cifrar as cinco do mesmo jeito
// mesmo assim, por uniformidade — o custo é zero e evita duas classes de
// campo na mesma tabela.
export const CHAVE_SMTP_HOST = "SMTP_HOST";
export const CHAVE_SMTP_PORT = "SMTP_PORT";
export const CHAVE_SMTP_USER = "SMTP_USER";
export const CHAVE_SMTP_PASS = "SMTP_PASS";
export const CHAVE_EMAIL_FROM = "EMAIL_FROM";

/**
 * Quem pode cadastrar credencial pela tela. Vive aqui, e não no arquivo de
 * actions, porque um módulo "use server" só pode exportar função assíncrona —
 * uma constante exportada de lá quebra o build.
 *
 * Os mesmos dois papéis da gestão de usuários, pelo mesmo motivo registrado em
 * `requireGestaoUsuarios`: a diretoria já pode criar um ADMIN e com isso se
 * promover, então exigir ADMIN não seria barreira. O que a lista de fato
 * guarda é o gasto na conta da Anthropic do grupo — RH_MANAGER e GESTOR_SETOR
 * ficam de fora.
 */
export const PAPEIS_QUE_CONFIGURAM: readonly string[] = ["ADMIN", "DIRETORIA"];

export type OrigemSegredo = "ambiente" | "sistema";

export type StatusSegredo = {
  ligado: boolean;
  origem: OrigemSegredo | null;
  dica: string | null;
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

/**
 * A credencial em claro, para uso no servidor. Nunca devolva isto ao cliente.
 *
 * O ambiente tem precedência sobre o banco de propósito: uma variável definida
 * na Vercel é o canal mais restrito dos dois, e quem já configurou lá não deve
 * ver o comportamento mudar por causa de um cadastro feito na tela. A tela
 * avisa quando isso acontece, para ninguém salvar uma chave nova e ficar sem
 * entender por que a antiga continua valendo.
 */
export async function segredo(nome: string): Promise<string | null> {
  const doAmbiente = process.env[nome];
  if (doAmbiente) return doAmbiente;

  const linha = await prisma.segredoApp.findUnique({
    where: { chave: nome },
    select: { valor: true },
  });
  if (!linha) return null;
  return decifrar(linha.valor);
}

/** O que a tela pode saber: se está ligado, de onde vem e os 4 últimos dígitos. */
export async function statusDoSegredo(nome: string): Promise<StatusSegredo> {
  const linha = await prisma.segredoApp.findUnique({
    where: { chave: nome },
    select: { dica: true, atualizadoEm: true, atualizadoPor: true },
  });

  if (process.env[nome]) {
    return {
      ligado: true,
      origem: "ambiente",
      dica: linha?.dica ?? null,
      atualizadoEm: linha?.atualizadoEm ?? null,
      atualizadoPor: linha?.atualizadoPor ?? null,
    };
  }

  if (!linha) {
    return { ligado: false, origem: null, dica: null, atualizadoEm: null, atualizadoPor: null };
  }

  return {
    ligado: true,
    origem: "sistema",
    dica: linha.dica,
    atualizadoEm: linha.atualizadoEm,
    atualizadoPor: linha.atualizadoPor,
  };
}

/**
 * Grava uma credencial cifrada. Extraído do que já era o meio de
 * `salvarChaveAnthropic` (lib/actions/rh-segredos.ts) para as actions de
 * Telegram/SMTP reaproveitarem sem repetir o upsert — a action da Anthropic
 * continua com o próprio upsert inline, sem necessidade de tocar nela.
 */
export async function gravarSegredo(
  chave: string,
  valorClaro: string,
  dica: string,
  atualizadoPor: string,
): Promise<void> {
  await prisma.segredoApp.upsert({
    where: { chave },
    create: { chave, valor: cifrar(valorClaro), dica, atualizadoPor },
    update: { valor: cifrar(valorClaro), dica, atualizadoPor },
  });
}

export type StatusSmtp = {
  ligado: boolean;
  origem: OrigemSegredo | null;
  host: string | null;
  port: string | null;
  user: string | null;
  from: string | null;
  /** Só da senha — os outros quatro campos não são segredo (ver comentário nas chaves). */
  dicaSenha: string | null;
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

/**
 * Status combinado das 5 chaves do SMTP numa forma só, para a tela não
 * orquestrar 5 chamadas. "ligado" exige host+user+senha — porta e remetente
 * têm valor padrão no `lib/email.ts` se ausentes.
 */
export async function statusDoSmtp(): Promise<StatusSmtp> {
  const [host, port, user, pass, from] = await Promise.all([
    statusDoSegredo(CHAVE_SMTP_HOST),
    statusDoSegredo(CHAVE_SMTP_PORT),
    statusDoSegredo(CHAVE_SMTP_USER),
    statusDoSegredo(CHAVE_SMTP_PASS),
    statusDoSegredo(CHAVE_EMAIL_FROM),
  ]);

  return {
    ligado: host.ligado && user.ligado && pass.ligado,
    // Se qualquer um dos cinco veio do ambiente, a origem mostrada é
    // "ambiente" — é o cenário mais comum (todo o bloco SMTP configurado de
    // uma vez na Vercel) e evita a tela mostrar uma mistura confusa.
    origem: [host, port, user, pass, from].some((s) => s.origem === "ambiente")
      ? "ambiente"
      : pass.origem,
    host: host.dica,
    port: port.dica,
    user: user.dica,
    from: from.dica,
    dicaSenha: pass.dica,
    atualizadoEm: pass.atualizadoEm,
    atualizadoPor: pass.atualizadoPor,
  };
}
