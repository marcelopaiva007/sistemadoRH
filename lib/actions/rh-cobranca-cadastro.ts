"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { PAPEIS_QUE_CONFIGURAM } from "@/lib/segredos";
import {
  cobrarCadastroAgora,
  executarCobrancaCadastro,
  type ResultadoCobrancaManual,
} from "@/lib/cobranca-cadastro-colaborador";
import type { ActionResult } from "@/lib/constants";

// Disparo À MÃO da cobrança de cadastro. O automático é o cron
// (app/api/cron/cobranca-cadastro) e não passa por aqui.
//
// Duas operações com donos diferentes, de propósito:
//
//   cobrarCadastro       — uma ou várias pessoas escolhidas. Quem opera o RH
//                          faz isso o dia inteiro, então basta acesso à
//                          empresa (RH_MANAGER e acima).
//   rodarCobrancaAgora   — a rodada INTEIRA, fora do horário. É o mesmo poder
//                          do cron na mão de uma pessoa, e mora na tela de
//                          Lembretes: mesmos dois papéis que mexem em horário
//                          de lembrete (ADMIN/DIRETORIA, ver rh-lembretes.ts).

/**
 * Teto por clique.
 *
 * Era 200, com o comentário certo ("é limite de tempo da requisição") e o
 * número errado: cada pessoa custa uma chamada ao Telegram MAIS uma ao SMTP,
 * em série. O mesmo laço, no cron, precisou de `maxDuration = 300` para caber
 * — e as páginas que hospedam este botão não declaravam duração nenhuma,
 * ficando no padrão da plataforma. 200 pessoas estouravam com folga, e o
 * sintoma seria exatamente o que este código diz querer evitar: metade
 * cobrada, sem ninguém saber quais.
 *
 * 50 cabe com margem larga mesmo no pior caso de rede, e é lote de gente que
 * alguém de fato seleciona à mão. Para a base inteira existe "Rodar agora".
 */
const MAXIMO_POR_VEZ = 50;

export type ResultadoCobrancaEmLote = ActionResult & {
  enviados?: number;
  falhas?: ResultadoCobrancaManual[];
};

/**
 * Cobra as pessoas escolhidas, agora, ignorando a trava de dias e o teto de
 * rodadas (ver `cobrarCadastroAgora`). Devolve quem não recebeu e por quê — um
 * "pronto!" que esconde 5 falhas em 30 envios é pior que não ter o botão.
 */
export async function cobrarCadastro(
  empresaId: string,
  colaboradorIds: string[],
): Promise<ResultadoCobrancaEmLote> {
  const usuario = await requireEmpresaAccess(empresaId);

  const ids = [...new Set(colaboradorIds.filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Selecione pelo menos um colaborador." };
  if (ids.length > MAXIMO_POR_VEZ) {
    // Não é limite de banco: é o tempo da server action. Cada pessoa custa uma
    // chamada ao Telegram mais uma ao SMTP, em série, e um clique que estoura o
    // tempo da requisição deixaria metade cobrada sem ninguém saber quais.
    return {
      ok: false,
      error: `Máximo de ${MAXIMO_POR_VEZ} por vez — selecione menos gente, ou use "Rodar agora" em Configuração → Lembretes.`,
    };
  }

  // ESCOPO: a lista de colaboradores mostra gente de todas as empresas
  // visíveis, não só a da rota — por isso o filtro é `empresasVisiveis`, e não
  // `empresaId`. Sem isto, um id vindo de fora do escopo (a action é um
  // endpoint público) mandaria mensagem em nome de uma empresa que este
  // usuário não administra.
  const visiveis = await empresasVisiveis(usuario);
  const permitidos = await prisma.colaborador.findMany({
    where: { id: { in: ids }, empresaId: { in: visiveis } },
    select: { id: true },
  });
  if (permitidos.length === 0) {
    return { ok: false, error: "Nenhum dos colaboradores selecionados está no seu escopo." };
  }

  const resultados = await cobrarCadastroAgora(
    permitidos.map((p) => p.id),
    // `username` é o nome de exibição na sessão (ver types/next-auth.d.ts) —
    // é ele que vai para `solicitadaPorNome` e aparece no histórico.
    usuario.username ?? usuario.email ?? "RH",
  );
  const enviados = resultados.filter((r) => r.enviado);
  const falhas = resultados.filter((r) => !r.enviado);

  // Uma entrada por EMPRESA DA PESSOA, e não uma sob o `empresaId` da rota: a
  // lista mostra colaboradores de todas as empresas visíveis, então cobrar
  // alguém da empresa B estando na tela da empresa A registrava tudo na trilha
  // de A. A trilha de B — onde alguém procuraria — não mostrava nada, e as
  // telas que leem AuditLog filtram justamente por empresaId.
  const porEmpresa = new Map<string, typeof enviados>();
  for (const e of enviados) {
    porEmpresa.set(e.empresaId, [...(porEmpresa.get(e.empresaId) ?? []), e]);
  }
  for (const [empresaDaPessoa, doGrupo] of porEmpresa) {
    await registrarAuditoria({
      empresaId: empresaDaPessoa,
      acao: "ATUALIZAR",
      entidade: "CobrancaCadastro",
      resumo:
        doGrupo.length === 1
          ? `Cobrança de cadastro enviada à mão para ${doGrupo[0].nome} (${doGrupo[0].canais.join(" e ").toLowerCase()}).`
          : `Cobrança de cadastro enviada à mão para ${doGrupo.length} colaborador(es).`,
    });
  }

  revalidatePath(`/rh/${empresaId}/colaboradores`);
  for (const r of enviados) revalidatePath(`/rh/${empresaId}/colaboradores/${r.colaboradorId}`);

  if (enviados.length === 0) {
    return {
      ok: false,
      error: falhas[0]?.motivo ?? "Nenhuma cobrança foi enviada.",
      falhas,
    };
  }
  return { ok: true, enviados: enviados.length, falhas };
}

export type ResultadoRodadaManual = ActionResult & {
  enviados?: number;
  porTelegram?: number;
  porEmail?: number;
  aguardandoPrazo?: number;
  esgotados?: number;
};

/**
 * Roda a cobrança inteira agora, fora do horário — o mesmo que o cron faria,
 * com as mesmas regras (só quem está na vez). Não confundir com o botão da
 * ficha: aquele é uma decisão sobre UMA pessoa e ignora as travas; este é
 * antecipar o relógio da campanha, e mexer nas travas aqui atropelaria a
 * cadência de todo mundo de uma vez.
 */
export async function rodarCobrancaAgora(empresaId: string): Promise<ResultadoRodadaManual> {
  const usuario = await requireEmpresaAccess(empresaId);
  if (!PAPEIS_QUE_CONFIGURAM.includes(usuario.role as string)) {
    return { ok: false, error: "Só a administração ou a diretoria pode disparar a rodada inteira." };
  }

  const r = await executarCobrancaCadastro();

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "CobrancaCadastro",
    resumo:
      `Rodada de cobrança de cadastro disparada à mão: ${r.enviados} pessoa(s) cobrada(s) ` +
      `(${r.porTelegram} por Telegram, ${r.porEmail} por e-mail).`,
  });

  return {
    ok: true,
    enviados: r.enviados,
    porTelegram: r.porTelegram,
    porEmail: r.porEmail,
    aguardandoPrazo: r.aguardandoPrazo,
    esgotados: r.esgotados,
  };
}
