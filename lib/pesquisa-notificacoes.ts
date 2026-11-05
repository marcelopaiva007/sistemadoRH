// Notificações de eventos do ciclo de pesquisa de clima.
// Apenas diretores e RH (roles DIRETORIA, RH_MANAGER, ADMIN).

import { prisma, type Cliente } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { PAPEIS_DE_RESTRICAO } from "@/lib/grupo";

export type NotificacaoCiclo = {
  empresaId: string;
  pesquisaId: string;
  titulo: string;
  tipo: "CRIADA" | "ENCERRADA" | "RELATORIO_PRONTO";
};

export type Destinatario = {
  userId: string;
  nome: string;
  email: string | null;
  telegramChatId: string | null;
};

// Buscar destinatários (diretoria + RH + admin) da empresa. `cliente` aceita
// um `tx` de transação — default `prisma` pra quem chama fora de uma (cron,
// server action normal).
export async function buscarDestinatarios(
  empresaId: string,
  cliente: Cliente = prisma,
): Promise<Destinatario[]> {
  // ADMIN e DIRETORIA recebem só se forem do GRUPO dono da empresa
  // (sociedade — lib/grupo.ts); RH_MANAGER, pelo vínculo com o CNPJ.
  const empresa = await cliente.empresa.findUnique({
    where: { id: empresaId },
    select: { marcaId: true, marca: { select: { grupoId: true } } },
  });
  const grupoId = empresa?.marca.grupoId;
  if (!grupoId) return [];
  const users = await cliente.user.findMany({
    where: {
      role: { in: ["ADMIN", "DIRETORIA", "RH_MANAGER"] },
      grupoId,
      OR: [{ empresaId }, { role: "ADMIN" }, { role: "DIRETORIA" }],
    },
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      empresaId: true,
    },
  });

  // ADMIN/DIRETORIA preso a algumas marcas pela tela de admin (lib/grupo.ts,
  // `direcaoRestrita`) só recebe aviso das empresas dessas marcas — o aviso
  // traz título e link de uma tela que ele não enxergaria.
  const direcaoIds = users
    .filter((u) => u.role === "ADMIN" || u.role === "DIRETORIA")
    .map((u) => u.id);
  const marcadas = direcaoIds.length
    ? await cliente.userMarca.findMany({
        where: { userId: { in: direcaoIds }, ativo: true, role: { in: PAPEIS_DE_RESTRICAO }, marca: { grupoId } },
        select: { userId: true, marcaId: true },
      })
    : [];
  const marcasDe = new Map<string, Set<string>>();
  for (const v of marcadas) {
    const conjunto = marcasDe.get(v.userId) ?? new Set<string>();
    conjunto.add(v.marcaId);
    marcasDe.set(v.userId, conjunto);
  }
  const direcaoVeEstaEmpresa = (userId: string) => {
    const marcas = marcasDe.get(userId);
    return !marcas || marcas.has(empresa!.marcaId);
  };

  return users
    .filter((u) =>
      u.role === "ADMIN" || u.role === "DIRETORIA" ? direcaoVeEstaEmpresa(u.id) : u.empresaId === empresaId,
    )
    .map((u) => ({
      userId: u.id,
      nome: u.nome,
      email: u.email,
      telegramChatId: null,
    }));
}

function mensagemPara(tipo: NotificacaoCiclo["tipo"], titulo: string, pesquisaId: string, empresaId: string): string {
  const link = `/rh/${empresaId}/pesquisas/${pesquisaId}`;
  switch (tipo) {
    case "CRIADA":
      return `Nova pesquisa de clima criada em rascunho: "${titulo}". Acesse para revisar e ativar: ${link}`;
    case "ENCERRADA":
      return `A pesquisa "${titulo}" foi encerrada. Relatório em: ${link}/dashboard-clima`;
    case "RELATORIO_PRONTO":
      return `Relatório de clima disponível: "${titulo}". Acesse: ${link}/dashboard-clima`;
  }
}

// Envia notificação por e-mail (canal principal)
export async function notificarCiclo(notif: NotificacaoCiclo): Promise<{
  enviados: number;
  erros: number;
}> {
  const destinatarios = await buscarDestinatarios(notif.empresaId);
  const msg = mensagemPara(notif.tipo, notif.titulo, notif.pesquisaId, notif.empresaId);

  let enviados = 0;
  let erros = 0;

  for (const d of destinatarios) {
    if (!d.email) continue;
    const result = await sendEmail({
      to: d.email,
      subject: `[RH] ${notif.tipo === "CRIADA" ? `Nova pesquisa: ${notif.titulo}` : notif.tipo === "ENCERRADA" ? "Pesquisa encerrada" : "Relatório disponível"}`,
      text: msg,
      html: `<p>${msg}</p>`,
      // O mesmo evento de ciclo pode ser reprocessado no dia; o gestor só
      // precisa saber uma vez.
      chave: `ciclo:${notif.pesquisaId}:${notif.tipo}:${d.email}`,
    });
    if (result.ok) enviados++;
    else erros++;
  }

  return { enviados, erros };
}
