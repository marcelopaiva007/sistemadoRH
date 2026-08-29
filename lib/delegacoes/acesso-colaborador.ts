import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma, type Cliente } from "@/lib/prisma";

// A PONTE entre quem tem login e quem só tem ficha na folha.
//
// A decisão da Direção em 29/08/2026: demanda pode ir para QUALQUER pessoa —
// usuário do sistema ou funcionário. Quem já é usuário abre a tela normal;
// quem não é responde pelo PORTAL, a mesma porta sem senha que ele já usa para
// bater ponto e confirmar entrega (autenticada pelo bot do Telegram).
//
// O PROBLEMA QUE ISTO RESOLVE. A demanda aponta para UM dono (regra 1), e as
// duas identidades do sistema não se sobrepõem: ADMIN e RH costumam não ter
// ficha; a maioria dos 341 funcionários não tem login. Fazer a demanda apontar
// ora para um, ora para outro, obrigaria toda consulta, toda regra e toda tela
// a perguntar duas vezes — e, pior, no dia em que um funcionário ganhasse
// login, as demandas antigas ficariam presas na outra referência: a pessoa
// veria metade da própria história em cada lugar. Num módulo cuja razão de
// existir é medir quem entrega, histórico partido é o defeito mais caro.
//
// A SAÍDA: `User` é a identidade única, e o funcionário sem login ganha um
// usuário DE ACESSO PELO PORTAL — sem senha utilizável, ligado à ficha. Se um
// dia essa pessoa virar usuário de verdade, é a MESMA linha que recebe senha e
// papel: nada se parte, e o histórico continua inteiro.

/**
 * O papel de quem só existe para receber demanda pelo portal.
 *
 * Não alcança nada: `modulosDoPapel("COLABORADOR")` devolve lista vazia
 * (components/modulos.ts filtra por papel), e sem perfil atribuído
 * `sistemasPermitidos` cai nesse fallback — ou seja, a guarda de todo módulo
 * barra. Falha FECHADA por construção, não por lembrança de quem codou.
 */
export const PAPEL_PORTAL = "COLABORADOR";

/**
 * Uma senha que ninguém tem. Não é string vazia: `bcrypt.compare` devolve
 * `false` para hash inválido hoje, mas depender desse detalhe é depender de
 * comportamento de biblioteca. Um hash VÁLIDO de um segredo aleatório que
 * nunca sai desta função é seguro em qualquer versão — e continua seguro se um
 * dia alguém trocar o bcrypt.
 */
async function senhaImpossivel(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), 10);
}

/**
 * Um `username` estável e que não colide com os humanos do sistema. O prefixo
 * é reservado — a tela de criar usuário não deixa digitar assim — e o id da
 * ficha garante unicidade sem depender do nome (que muda, e se repete).
 */
export function usernameDoPortal(colaboradorId: string): string {
  return `colaborador.${colaboradorId}`;
}

export type ResultadoAcesso =
  | { ok: true; userId: string; nome: string; criado: boolean }
  | { ok: false; erro: string };

/**
 * Devolve o `User.id` que representa este funcionário, criando o acesso de
 * portal se ele ainda não existir. Idempotente: chamar de novo devolve o
 * mesmo id, nunca um segundo usuário.
 *
 * A ordem de busca importa. Primeiro pelo VÍNCULO (`colaboradorId`), que é a
 * verdade — se a pessoa já tem login de verdade, é ele que responde e nenhum
 * usuário de portal é criado. Só depois pelo username reservado, que cobre o
 * caso de o vínculo ter sido desfeito à mão sem apagar a linha.
 */
export async function garantirAcessoDoColaborador(
  colaboradorId: string,
  tx: Cliente = prisma,
): Promise<ResultadoAcesso> {
  const colaborador = await tx.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { id: true, nome: true, ativo: true, email: true },
  });
  if (!colaborador) return { ok: false, erro: "Funcionário não encontrado." };
  if (!colaborador.ativo) {
    return { ok: false, erro: `${colaborador.nome} está desligado — não dá para delegar a ele.` };
  }

  const existente = await tx.user.findUnique({
    where: { colaboradorId },
    select: { id: true, nome: true, ativo: true },
  });
  if (existente) {
    if (!existente.ativo) {
      return { ok: false, erro: `O acesso de ${existente.nome} está desativado. Reative em Usuários e perfis.` };
    }
    return { ok: true, userId: existente.id, nome: existente.nome, criado: false };
  }

  const username = usernameDoPortal(colaboradorId);
  const porUsername = await tx.user.findUnique({
    where: { username },
    select: { id: true, nome: true },
  });
  if (porUsername) {
    return { ok: true, userId: porUsername.id, nome: porUsername.nome, criado: false };
  }

  // E-MAIL FICA NULO, E ISSO É UMA TRAVA DE SEGURANÇA — não economia de campo.
  //
  // "Esqueci minha senha" (lib/actions/recuperacao-senha.ts) acha a pessoa por
  // `findUnique({ where: { email } })` e só confere `ativo`. Um acesso de
  // portal com e-mail preenchido pediria o link de recuperação, definiria uma
  // senha e viraria login de verdade — sozinho, sem ninguém conceder nada. A
  // senha impossível não segura isso; o e-mail nulo segura.
  //
  // De quebra, `User.email` é único: copiar da ficha quebraria na primeira
  // pessoa com o mesmo e-mail em duas fichas, e ocuparia o endereço de quem
  // amanhã vira usuário de verdade.
  //
  // Quem for promovido a usuário do sistema recebe e-mail e senha pela tela de
  // Usuários — decisão explícita de alguém, que é como acesso deve nascer.
  const criado = await tx.user.create({
    data: {
      nome: colaborador.nome,
      username,
      passwordHash: await senhaImpossivel(),
      role: PAPEL_PORTAL,
      colaboradorId,
      ativo: true,
    },
    select: { id: true, nome: true },
  });

  return { ok: true, userId: criado.id, nome: criado.nome, criado: true };
}

/**
 * Este usuário é um acesso de portal (funcionário sem login) ou uma pessoa que
 * entra pelo sistema? Usado pelas telas de administração para não misturar as
 * duas coisas numa lista só.
 */
export function ehAcessoDePortal(user: { role: string }): boolean {
  return user.role === PAPEL_PORTAL;
}
