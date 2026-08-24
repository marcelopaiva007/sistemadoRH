import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { ContratosView, type ContratoNaTela } from "./contratos-view";

// Os contratos do grupo — o segundo domínio da onda 1.
//
// Consolidada por padrão, como o resto do módulo: sem `?empresas=` na URL,
// mostra todos os CNPJs que a pessoa enxerga. O contrato é POR CNPJ (quem
// assina é uma empresa), mas quem trabalha com ele responde pelo grupo inteiro.
export default async function ContratosPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; status?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, status: statusParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const [empresa, contratos, contrapartes, gestores, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.contrato.findMany({
      where: { empresaId: { in: escopo } },
      // O que vence antes no topo: a tela existe para a decisão que tem prazo.
      // `dataFim` nula (indeterminado) vai para o fim — não tem relógio
      // correndo. Ordenar por `status` aqui não funciona: o campo é texto, e
      // "asc" jogaria VIGENTE para o fim (depois de CANCELADO e ENCERRADO). A
      // separação por status é o filtro da tela, que abre em "Vigente".
      orderBy: [{ dataFim: { sort: "asc", nulls: "last" } }],
      select: {
        id: true,
        empresaId: true,
        numero: true,
        titulo: true,
        objeto: true,
        tipo: true,
        categoria: true,
        status: true,
        criticidade: true,
        gestorId: true,
        gestorNome: true,
        contraparteId: true,
        contraparte: { select: { razaoSocial: true } },
        dataAssinatura: true,
        dataInicio: true,
        dataFim: true,
        indeterminado: true,
        renovacaoAutomatica: true,
        avisoPrevioNaoRenovacaoDias: true,
        dataLimiteDenuncia: true,
        locacaoNaoResidencial: true,
        janelaRenovatoriaFim: true,
        buildToSuit: true,
        renunciaRevisionalPactuada: true,
        valorMensal: true,
        valorTotal: true,
        indiceReajuste: true,
        periodicidadeReajusteMeses: true,
        mesBaseReajuste: true,
        proximoReajuste: true,
        ultimoReajusteEm: true,
        multaCompensatoriaPct: true,
        multaMoratoriaPct: true,
        foroComarca: true,
        foroUf: true,
        lgpdAplicavel: true,
        pontosFixacaoContratados: true,
        pontosFixacaoOcupados: true,
        observacoes: true,
      },
    }),
    // A contraparte é do GRUPO, não do CNPJ — a lista do formulário não é
    // escopada. Duplicar o mesmo locador por empresa é o que este modelo evita.
    prisma.contraparte.findMany({
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, cnpjCpf: true },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo }, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();

  const naTela: ContratoNaTela[] = contratos.map((c) => ({
    id: c.id,
    empresaId: c.empresaId,
    empresaNome: nomeDaEmpresa.get(c.empresaId) ?? "—",
    numero: c.numero,
    titulo: c.titulo,
    objeto: c.objeto,
    tipo: c.tipo,
    categoria: c.categoria,
    status: c.status,
    criticidade: c.criticidade,
    gestorId: c.gestorId,
    gestorNome: c.gestorNome,
    contraparteId: c.contraparteId,
    contraparteNome: c.contraparte.razaoSocial,
    dataAssinaturaInput: paraInputDate(c.dataAssinatura),
    dataInicioInput: paraInputDate(c.dataInicio),
    dataFimInput: paraInputDate(c.dataFim),
    dataFimTexto: c.indeterminado ? "Indeterminado" : formatarData(c.dataFim),
    diasParaFim: c.dataFim ? diferencaEmDiasUTC(c.dataFim, hoje) : null,
    indeterminado: c.indeterminado,
    renovacaoAutomatica: c.renovacaoAutomatica,
    avisoPrevioNaoRenovacaoDias: c.avisoPrevioNaoRenovacaoDias,
    // Os dois prazos que a Central cobra, repetidos aqui para a linha explicar
    // sozinha por que virou alerta — sem obrigar a ir e voltar entre as telas.
    dataLimiteDenunciaTexto: c.dataLimiteDenuncia ? formatarData(c.dataLimiteDenuncia) : "",
    diasParaDenuncia: c.dataLimiteDenuncia ? diferencaEmDiasUTC(c.dataLimiteDenuncia, hoje) : null,
    janelaRenovatoriaFimTexto: c.janelaRenovatoriaFim ? formatarData(c.janelaRenovatoriaFim) : "",
    locacaoNaoResidencial: c.locacaoNaoResidencial,
    buildToSuit: c.buildToSuit,
    renunciaRevisionalPactuada: c.renunciaRevisionalPactuada,
    valorMensal: c.valorMensal,
    valorTotal: c.valorTotal,
    indiceReajuste: c.indiceReajuste,
    periodicidadeReajusteMeses: c.periodicidadeReajusteMeses,
    mesBaseReajuste: c.mesBaseReajuste,
    proximoReajusteTexto: c.proximoReajuste ? formatarData(c.proximoReajuste) : "",
    // Só quem tem reajuste vencido ou vencendo ganha o botão de aplicar.
    reajusteDevido: c.proximoReajuste ? diferencaEmDiasUTC(c.proximoReajuste, hoje) <= 0 : false,
    // A data que o painel de reajuste sugere: o próprio mês-base que venceu.
    proximoReajusteInput: paraInputDate(c.proximoReajuste),
    valorMensalInput: c.valorMensal !== null ? String(c.valorMensal) : "",
    multaCompensatoriaPct: c.multaCompensatoriaPct,
    multaMoratoriaPct: c.multaMoratoriaPct,
    foroComarca: c.foroComarca,
    foroUf: c.foroUf,
    lgpdAplicavel: c.lgpdAplicavel,
    pontosFixacaoContratados: c.pontosFixacaoContratados,
    pontosFixacaoOcupados: c.pontosFixacaoOcupados,
    observacoes: c.observacoes,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Contratos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Torres, terrenos, postes, prefeituras, fornecedores e prestadores. O que gera prazo —
          aviso de não-renovação, ação renovatória e reajuste — vira pendência com data e dono.
        </p>
      </div>

      <ContratosView
        empresaId={empresaId}
        contratos={naTela}
        statusInicial={statusParam ?? "VIGENTE"}
        contrapartes={contrapartes}
        gestores={gestores}
        empresas={empresas}
      />
    </div>
  );
}
