import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { PAPEIS_QUE_ASSUMEM_PENDENCIA, STATUS_COM_PRAZO_CORRENDO } from "@/lib/processos/pendencias";
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
      // Aluguel a receber (categoria RECEITA) NÃO aparece aqui: por decisão do
      // dono (27/08/2026), ele vive inteiro na tela de Aluguéis — cadastro,
      // edição e parcelas. Misturar receita com despesa nesta lista era o que
      // confundia quem procurava o aluguel.
      where: { empresaId: { in: escopo }, categoria: { not: "RECEITA" } },
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
    // O gestor é USUÁRIO DO SISTEMA, não ficha de colaborador.
    //
    // Até a v1.173.0 esta consulta era `colaborador.findMany` e despejava a
    // folha inteira no <select> — centenas de nomes, a maioria sem login. Pior
    // que o tamanho era o tipo: `Contrato.gestorId` alimenta
    // `Pendencia.responsavelId`, e esse campo é id de USUÁRIO em todo o resto
    // do sistema (`definirResponsavel` valida contra `prisma.user`). Um id de
    // ficha ali produzia pendência que MOSTRA um nome e não tem dono que possa
    // entrar e resolver. O próprio schema já dizia qual era a intenção: o
    // comentário de `gestorId` manda seguir `Sinal.donoUserId`, que é
    // "escolha MANUAL entre os usuários do sistema".
    //
    // Mesma consulta da Central (app/(app)/processos/[empresaId]/page.tsx) —
    // as duas listas precisam concordar sobre quem pode ser dono.
    prisma.user.findMany({
      where: { ativo: true, role: { in: PAPEIS_QUE_ASSUMEM_PENDENCIA } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    // `cnpj` vem junto porque quem ASSINA precisa ter um. Empresa provisória
    // (a "A DEFINIR" onde a importação de frota estaciona veículo sem dono) é
    // uma Empresa ativa como outra qualquer; sem este dado a tela não tem como
    // distinguir, e o contrato nasceria no CNPJ de ninguém.
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { id: true, nome: true, cnpj: true },
    }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  // O CNPJ não desce para o navegador — a tela só precisa saber SE existe, para
  // decidir quem pode assinar e para nomear quem ficou de fora.
  const empresasNaTela = empresas.map((e) => ({ id: e.id, nome: e.nome, temCnpj: e.cnpj !== null }));
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
    // A mesma régua da Central: os números do topo da tela contam o que ainda
    // tem relógio correndo, e não o recorte de status que estiver aberto.
    prazoCorrendo: (STATUS_COM_PRAZO_CORRENDO as readonly string[]).includes(c.status),
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
        <h1 className="mt-1">Contratos</h1>
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
        empresas={empresasNaTela}
      />
    </div>
  );
}
