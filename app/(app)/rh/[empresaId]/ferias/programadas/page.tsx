import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import {
  STATUS_DE_AGENDA,
  contaComoProgramada,
  resumirProgramacaoFerias,
} from "@/lib/ferias-passivo";
import { diferencaEmDiasUTC, hojeUTC } from "@/lib/datas";
import { ProgramadasView } from "./programadas-view";

// A agenda de férias do grupo: tudo que está programado (pendente ou aprovado)
// e ainda não terminou — quem está em gozo agora e quem ainda vai sair.
//
// É a lista que o cartão "Férias programadas" da tela de Férias abre. O número
// de lá e o desta tela saem da MESMA função (`contaComoProgramada`,
// lib/ferias-passivo.ts) — se as duas contas divergirem um dia, o bug é lá,
// não aqui (regra do projeto: contador e lista são o mesmo universo).
//
// ESCOPO: `empresasVisiveis` + interseção com `?empresas=`, igual à tela de
// Férias — a agenda é do grupo, o filtro de marca/CNPJ da lateral continua
// valendo.
//
// PRIVACIDADE: nada de salário aqui — só nome, datas e dias, o mesmo recorte
// nominal que a fila de férias já expõe para GESTOR_SETOR.

export type LinhaProgramada = {
  solicitacaoId: string;
  colaboradorId: string;
  nome: string;
  colaboradorAtivo: boolean;
  empresaId: string;
  empresa: string;
  setor: string;
  inicio: Date;
  fim: Date;
  periodoAquisitivoInicio: Date;
  dias: number;
  diasAbono: number;
  status: string;
  /** Já começou e ainda não terminou. */
  emGozo: boolean;
  /** Dias até o início (0 = começa hoje; negativo = já começou). */
  comecaEmDias: number;
  /** Dias até o fim, para quem está em gozo. */
  terminaEmDias: number;
  /** MESMA regra do cartão "Férias programadas" (contaComoProgramada). */
  naJanela: boolean;
};

export default async function FeriasProgramadasPage({
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
  // Mesma regra duplicada de ferias/page.tsx (e pelo mesmo motivo — o módulo
  // do filtro é "use client"): sem filtro na URL, tudo que o usuário enxerga;
  // com filtro, a INTERSEÇÃO — id digitado à mão não vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const hoje = hojeUTC();

  const [agenda, todas, empresas] = await Promise.all([
    // A agenda em si: pedido vivo que ainda não terminou. `dataFim >= hoje`
    // (e não `dataInicio >= hoje`) para quem está de férias NESTE momento
    // não sumir da tela no dia em que embarca.
    prisma.solicitacaoFerias.findMany({
      where: {
        empresaId: { in: escopo },
        status: { in: [...STATUS_DE_AGENDA] },
        dataFim: { gte: hoje },
      },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        empresaId: true,
        dataInicio: true,
        dataFim: true,
        periodoAquisitivoInicio: true,
        dias: true,
        diasAbono: true,
        status: true,
        colaborador: {
          select: {
            id: true,
            nome: true,
            ativo: true,
            empresa: { select: { nome: true } },
            setor: { select: { nome: true } },
          },
        },
      },
    }),
    // TODOS os registros do recorte, como na tela de Férias: alimentam o
    // resumo que explica o estado vazio ("os N registros existentes são
    // histórico, não agenda") com os mesmos números do cartão.
    prisma.solicitacaoFerias.findMany({
      where: { empresaId: { in: escopo } },
      select: { dataInicio: true, status: true },
    }),
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
  ]);

  const programacao = resumirProgramacaoFerias(todas, hoje);

  const linhas: LinhaProgramada[] = agenda.map((s) => {
    const comecaEmDias = diferencaEmDiasUTC(s.dataInicio, hoje);
    return {
      solicitacaoId: s.id,
      colaboradorId: s.colaborador.id,
      nome: s.colaborador.nome,
      colaboradorAtivo: s.colaborador.ativo,
      empresaId: s.empresaId,
      empresa: s.colaborador.empresa.nome,
      setor: s.colaborador.setor.nome,
      inicio: s.dataInicio,
      fim: s.dataFim,
      periodoAquisitivoInicio: s.periodoAquisitivoInicio,
      dias: s.dias,
      diasAbono: s.diasAbono,
      status: s.status,
      emGozo: comecaEmDias <= 0,
      comecaEmDias,
      terminaEmDias: diferencaEmDiasUTC(s.dataFim, hoje),
      naJanela: contaComoProgramada(s, hoje),
    };
  });

  const marcas = [...new Set(empresas.map((e) => e.marca.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <ProgramadasView
      empresaId={empresaId}
      linhas={linhas}
      programacao={programacao}
      escopo={{ cnpjs: empresas.length, marcas }}
    />
  );
}
