import type { Prisma } from "@/app/generated/prisma/client";
import { diaBrasilia } from "@/lib/datas";
import { severidadeDoPrazo, type SeveridadePrazo } from "@/lib/constants-delegacoes";
import { STATUS_ATIVOS } from "@/lib/delegacoes/estados";
import type { DemandaParaPainel } from "@/lib/delegacoes/painel-entregas";

// QUEM ENXERGA QUAL DEMANDA — a regra de visibilidade por linha, no servidor.
//
// A guarda do módulo (lib/delegacoes-auth-guard.ts) responde "você entra?".
// Este arquivo responde "você enxerga ESTA demanda?", e é a resposta que entra
// no `where` de toda consulta do módulo. Nunca filtre no cliente: o dado que
// chega ao navegador já tem que estar recortado.
//
// A ordem da Direção (§10) descreve três papéis:
//
//   direcao      → tudo
//   gestor       → o que delegou + o que recebeu + demandas da sua área
//   colaborador  → o que delegou + o que recebeu
//
// Traduzindo para o que este sistema TEM hoje, sem inventar cadastro novo:
//
// - `direcao` são ADMIN e DIRETORIA. É o mesmo recorte que o fallback de
//   `components/modulos.ts` usa e o mesmo que os perfis-semente com grant `*`
//   já concedem — "a Direção vê tudo" sai de graça, sem papel novo.
//
// - `gestor` e `colaborador` viram A MESMA regra: sou solicitante OU sou
//   responsável. A diferença entre os dois na ordem é o "+ demandas da sua
//   área", e esse recorte NÃO EXISTE no dado: `Demanda.area` é texto livre
//   (spec §3.1) e não há cadastro que ligue uma pessoa a uma área. Implementar
//   por comparação de string daria a um gestor acesso às demandas de qualquer
//   um que tenha digitado a mesma palavra — que é conceder acesso por
//   coincidência de digitação. Fica de fora até existir o vínculo, e é decisão
//   consciente, não esquecimento.
//
// Consequência que vale dizer em voz alta: um gestor NÃO vê as demandas que
// seu liderado recebeu de outra pessoa. Se a Direção quiser isso, o caminho é
// ligar demanda a setor (`Colaborador.supervisorId` já existe e é o que
// "Meu time" usa) — e aí é regra nova, com tela e teste.

/** O recorte de quem vê tudo. */
export function ehDirecao(user: { role: string }): boolean {
  return user.role === "ADMIN" || user.role === "DIRETORIA";
}

/**
 * O `where` que recorta a lista para este usuário. Direção recebe `{}` (sem
 * recorte); todo o resto recebe "eu pedi OU eu faço".
 *
 * Combine com os filtros da tela usando `AND`, nunca espalhando no mesmo
 * objeto: `{ ...visivel, status: "ENVIADA" }` funcionaria hoje por acaso, mas
 * quebra silenciosamente no dia em que o recorte também usar `OR` — os dois
 * `OR` no mesmo nível se sobrescrevem, e o de acesso é o que some.
 */
export function demandasVisiveisPara(user: {
  id?: string;
  role: string;
}): Prisma.DemandaWhereInput {
  if (ehDirecao(user)) return {};
  // Sem id na sessão não há como provar participação: não mostra nada. Falhar
  // fechado é o único jeito seguro — a alternativa devolveria a base inteira.
  if (!user.id) return { id: { in: [] } };
  return { OR: [{ solicitanteId: user.id }, { responsavelId: user.id }] };
}

/**
 * A mesma pergunta para UMA demanda já carregada — usada na tela de detalhe,
 * onde a consulta é por id e o recorte não pode ir no `where` sem transformar
 * "sem acesso" em "não existe".
 */
export function podeVerDemanda(
  user: { id?: string; role: string },
  demanda: { solicitanteId: string; responsavelId: string },
): boolean {
  if (ehDirecao(user)) return true;
  if (!user.id) return false;
  return demanda.solicitanteId === user.id || demanda.responsavelId === user.id;
}

// ── O que as duas listas leem, e como a linha chega pronta na tela ──────────
//
// `DemandaNaTela` mora aqui, e não no `-view.tsx` como manda a convenção do
// repo, por um motivo só: DUAS telas desenham a mesma linha (Recebidas e
// Delegadas por mim). O tipo no arquivo de uma delas obrigaria a outra a
// importar da vizinha, e a primeira divergência nasceria no dia em que alguém
// mexesse numa sem abrir a outra.

/**
 * `select` explícito, nunca `include`. A lista inteira é serializada no HTML
 * que vai ao navegador — é a razão registrada em colaboradores/page.tsx, onde
 * um `include` mandava salário e dados bancários da base toda para a tela.
 */
export const SELECT_LISTA = {
  id: true,
  titulo: true,
  descricao: true,
  status: true,
  criticidade: true,
  emRisco: true,
  prazo: true,
  prazoOriginal: true,
  evidenciaExigida: true,
  area: true,
  solicitante: { select: { nome: true } },
  responsavel: { select: { nome: true } },
  marca: { select: { nome: true } },
  _count: { select: { repactuacoes: true, entregas: true } },
} as const;

export type DemandaNaTela = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  criticidade: number;
  emRisco: boolean;
  /** Dias até o prazo; negativo = atrasada. */
  diasParaPrazo: number;
  prazoTexto: string;
  severidade: SeveridadePrazo;
  /** true quando o prazo já foi repactuado ao menos uma vez. */
  repactuada: boolean;
  solicitanteNome: string;
  responsavelNome: string;
  marcaNome: string | null;
  area: string | null;
  entregas: number;
  href: string;
};

type LinhaDoBanco = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  criticidade: number;
  emRisco: boolean;
  prazo: Date;
  solicitante: { nome: string };
  responsavel: { nome: string };
  marca: { nome: string } | null;
  area: string | null;
  _count: { repactuacoes: number; entregas: number };
};

/**
 * O prazo NO CALENDÁRIO DE BRASÍLIA, como "05/09/2026".
 *
 * `formatarData` lê componentes UTC, e aqui isso mente: `prazoDoFormulario`
 * ancora a data digitada em 23:59:59 de Brasília, que em UTC já é o dia
 * SEGUINTE. Quem digitava 05/09 via a tela responder 06/09. O helper certo já
 * existia (`diaBrasilia`, escrito para este mesmo problema no ponto
 * eletrônico) — só não estava sendo usado aqui.
 */
export function prazoEmTexto(prazo: Date): string {
  const [ano, mes, dia] = diaBrasilia(prazo).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Quantos dias faltam, contados em DIAS DE CALENDÁRIO DE BRASÍLIA — não em
 * milissegundos nem em componentes UTC. Negativo = atrasada.
 *
 * Os dois lados passam por `diaBrasilia` de propósito: comparar o instante
 * cru faria a virada do dia acontecer às 21:00 (meia-noite UTC), e a mesma
 * demanda mostraria "1d" de manhã e "0d" à noite do MESMO dia.
 */
export function diasAtePrazo(prazo: Date, agora = new Date()): number {
  const dia = (d: Date) => Date.parse(`${diaBrasilia(d)}T00:00:00Z`);
  return Math.round((dia(prazo) - dia(agora)) / 86_400_000);
}

/**
 * Do banco para a tela: tudo que é apresentação (dias restantes, data
 * formatada, severidade) é calculado AQUI, no servidor. O cliente recebe
 * string e número — nunca `Date`, que atravessaria a fronteira serializado e
 * seria formatado no fuso do navegador.
 */
export function paraLinha(d: LinhaDoBanco, agora = new Date()): DemandaNaTela {
  const diasParaPrazo = diasAtePrazo(d.prazo, agora);
  return {
    id: d.id,
    titulo: d.titulo,
    descricao: d.descricao,
    status: d.status,
    criticidade: d.criticidade,
    emRisco: d.emRisco,
    diasParaPrazo,
    prazoTexto: prazoEmTexto(d.prazo),
    severidade: severidadeDoPrazo(diasParaPrazo, d.criticidade),
    repactuada: d._count.repactuacoes > 0,
    solicitanteNome: d.solicitante.nome,
    responsavelNome: d.responsavel.nome,
    marcaNome: d.marca?.nome ?? null,
    area: d.area,
    entregas: d._count.entregas,
    href: `/delegacoes/${d.id}`,
  };
}

/**
 * O `where` de "demandas vivas": as que ainda pedem alguma coisa de alguém.
 * Encerrada e cancelada saem da lista por padrão — quem quiser o histórico
 * pede explicitamente na tela.
 */
export const APENAS_ATIVAS: Prisma.DemandaWhereInput = { status: { in: [...STATUS_ATIVOS] } };

// ── Painel de entregas (lib/delegacoes/painel-entregas.ts) ─────────────────
//
// `select` PRÓPRIO, separado de SELECT_LISTA: o painel precisa de
// `enviadaEm`/`aceiteEm` (o relógio da entrega) e do array de `entregas` com
// `aceita`, que a lista de demandas não usa. Estender SELECT_LISTA para
// carregar isto em toda tela (Recebidas incluída) seria payload morto na
// tela que não é dona da conta — o painel é olhar do SOLICITANTE.

export const SELECT_PAINEL = {
  status: true,
  prazo: true,
  enviadaEm: true,
  aceiteEm: true,
  responsavel: { select: { nome: true } },
  _count: { select: { repactuacoes: true } },
  entregas: { select: { createdAt: true, aceita: true } },
} as const;

type LinhaPainelDoBanco = {
  status: string;
  prazo: Date;
  enviadaEm: Date | null;
  aceiteEm: Date | null;
  responsavel: { nome: string };
  _count: { repactuacoes: number };
  entregas: { createdAt: Date; aceita: boolean | null }[];
};

/** Do banco (SELECT_PAINEL) para o formato que `montarPainelEntregas` come. */
export function paraPainel(d: LinhaPainelDoBanco): DemandaParaPainel {
  return {
    status: d.status,
    prazo: d.prazo,
    enviadaEm: d.enviadaEm,
    aceiteEm: d.aceiteEm,
    responsavelNome: d.responsavel.nome,
    repactuacoes: d._count.repactuacoes,
    entregas: d.entregas,
  };
}
