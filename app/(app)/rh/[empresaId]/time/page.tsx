import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { montarMeuTime, type ColaboradorParaTime } from "@/lib/meu-time";
import { TimeView } from "./time-view";

// "Meu time": a leitura de uma equipe, pessoa a pessoa — tempo de casa, férias,
// avaliação do ciclo, ficha e acesso ao portal, com o bloco dos primeiros 90
// dias dentro dela.
//
// POR QUE A TELA MORA NO MÓDULO RH: aqui é a visão do RH — a equipe inteira do
// escopo, com seletor de setor. São TRÊS portas para a mesma leitura, e todas
// usam o MESMO motor (lib/meu-time.ts), então RH e gestor nunca leem números
// diferentes da mesma equipe:
//   1. esta rota — RH e admin, equipe toda;
//   2. /rh/meu-setor — o gestor logado, recorte pelo próprio supervisorId
//      (possível desde 12/08/2026, quando User ganhou colaboradorId);
//   3. o portal do colaborador — o mesmo recorte, para quem entra por Telegram
//      e não tem usuário do sistema (ver app/portal/page.tsx).
//
// ESCOPO: `empresasVisiveis` + filtro ?empresas= da lateral, como Férias e
// Liderança — equipe cruza CNPJ neste grupo. O recorte por setor é decisão da
// tela (seletor no cliente), não da consulta.
export default async function TimePage({
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
  // Mesma regra de `filtro-empresas.tsx::useFiltroEmpresas`: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão
  // não vira acesso. Duplicada porque aquele módulo é "use client" (mesmo
  // registro das telas de Férias e Placar).
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const [colaboradores, ciclosAbertos, empresas] = await Promise.all([
    // `select` explícito, nunca `include`: a lista atravessa para um Client
    // Component. cpf/salarioBase/telegramChatId são lidos SÓ para virar os
    // booleanos de lacuna abaixo — os valores não saem do servidor (mesmo
    // padrão de colaboradores/page.tsx).
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        empresaId: true,
        supervisorId: true,
        dataAdmissao: true,
        tipoContrato: true,
        dataFimContrato: true,
        cpf: true,
        salarioBase: true,
        telegramChatId: true,
        empresa: { select: { nome: true } },
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        ferias: {
          where: { status: { in: ["APROVADA", "PENDENTE"] } },
          select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
        },
        // Avaliações RECEBIDAS em ciclo aberto — filtrar por colaboradorId é o
        // certo aqui (a pergunta é "esta pessoa já foi avaliada?"), ao
        // contrário do portal, que filtra por avaliadorId.
        avaliacoesRecebidas: {
          where: { ciclo: { encerrado: false } },
          select: { status: true },
        },
        // "Nunca acessou o portal" = nenhuma sessão aberta (a régua dos 93/215
        // medidos). PortalAcesso não serve: link gerado e nunca clicado também
        // vira linha lá.
        _count: { select: { sessoesPortal: true } },
        checklistIntegracao: { select: { item: true, concluido: true, prazo: true } },
      },
    }),
    prisma.cicloAvaliacao.findMany({
      where: { empresaId: { in: escopo }, encerrado: false },
      select: { empresaId: true },
    }),
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
  ]);

  const empresasComCiclo = new Set(ciclosAbertos.map((c) => c.empresaId));

  const paraTime: ColaboradorParaTime[] = colaboradores.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresa: c.empresa.nome,
    setor: c.setor.nome,
    cargo: c.posicao.nome,
    dataAdmissao: c.dataAdmissao,
    tipoContrato: c.tipoContrato,
    dataFimContrato: c.dataFimContrato,
    semLider: c.supervisorId === null,
    semSalario: c.salarioBase === null || c.salarioBase === undefined,
    semCpf: !c.cpf,
    semTelegram: !c.telegramChatId,
    nuncaAcessouPortal: c._count.sessoesPortal === 0,
    ferias: c.ferias,
    temCicloAberto: empresasComCiclo.has(c.empresaId),
    avaliacoesCicloAberto: c.avaliacoesRecebidas,
    trilha: c.checklistIntegracao,
  }));

  const time = montarMeuTime(paraTime, hojeUTC());

  const marcas = [...new Set(empresas.map((e) => e.marca.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return <TimeView time={time} escopo={{ cnpjs: empresas.length, marcas }} />;
}
