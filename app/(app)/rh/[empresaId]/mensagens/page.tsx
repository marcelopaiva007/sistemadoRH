import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { MensagensView } from "./mensagens-view";

// Mensagens que os colaboradores mandam pelo portal (Fale com o RH). A
// resposta escrita aqui aparece de volta no portal da pessoa.
//
// ESCOPO: `empresasVisiveis` + filtro `?empresas=` da barra lateral — mesmo
// padrão do resto do módulo RH (ver aprovacoes/page.tsx).
const LIMITE_RESPONDIDAS = 200;

export default async function MensagensPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopoIds = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const camposDaMensagem = {
    id: true,
    mensagem: true,
    resposta: true,
    respondidaEm: true,
    respondidaPorNome: true,
    createdAt: true,
    colaborador: {
      select: {
        nome: true,
        setor: { select: { nome: true } },
        empresa: { select: { nome: true } },
      },
    },
  } as const;

  // Duas consultas de propósito: as ABERTAS vêm todas, sem teto — são a fila
  // que o contador de Pendências e o badge do menu prometem, e um `take: 200`
  // único fazia o cartão dizer 250 para uma tela que só mostrava 200. O teto
  // fica onde faz sentido: no histórico já respondido, que só existe como
  // contexto.
  //
  // O histórico vem das MAIS RECENTES (26/11/2026, auditoria): ordenava pela
  // resposta mais ANTIGA e cortava em 200 — passadas 200 respondidas, as de
  // ontem sumiam da tela e ficavam as de anos atrás. Busca uma a mais que o
  // teto para a tela poder dizer que existe histórico além do que mostra.
  const [abertas, respondidasMaisUma] = await Promise.all([
    prisma.mensagemPortal.findMany({
      where: { empresaId: { in: escopoIds }, respondidaEm: null },
      orderBy: { createdAt: "desc" },
      select: camposDaMensagem,
    }),
    prisma.mensagemPortal.findMany({
      where: { empresaId: { in: escopoIds }, respondidaEm: { not: null } },
      orderBy: [{ respondidaEm: "desc" }, { id: "desc" }],
      take: LIMITE_RESPONDIDAS + 1,
      select: camposDaMensagem,
    }),
  ]);
  const haMaisRespondidas = respondidasMaisUma.length > LIMITE_RESPONDIDAS;
  const respondidas = respondidasMaisUma.slice(0, LIMITE_RESPONDIDAS);
  const mensagens = [...abertas, ...respondidas];

  return (
    <MensagensView
      empresaId={empresaId}
      respondidasLimitadas={haMaisRespondidas ? LIMITE_RESPONDIDAS : null}
      mensagens={mensagens.map((m) => ({
        id: m.id,
        mensagem: m.mensagem,
        resposta: m.resposta,
        respondidaEm: m.respondidaEm,
        respondidaPorNome: m.respondidaPorNome,
        createdAt: m.createdAt,
        colaboradorNome: m.colaborador.nome,
        setor: m.colaborador.setor.nome,
        empresa: m.colaborador.empresa.nome,
      }))}
    />
  );
}
