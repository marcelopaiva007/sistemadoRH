// Transferência entre empresas do grupo — OS 11/11/2026, itens 6 e 7.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DECISÃO PARA REVISÃO. A v1.184.0 (lib/transferencia.ts) escolheu o       │
// │ caminho oposto para o colaborador: DUAS fichas (a antiga "Transferido",  │
// │ a nova ativa), com o argumento de que "33 tabelas escopam por empresaId  │
// │ — mover a ficha não é opção". O RH pediu em 11/11 o que aquele desenho   │
// │ não dá: transferir SEM recadastrar e SEM perder admissão, dossiê, férias │
// │ e avaliações. Este módulo MOVE a ficha e leva junto o histórico pessoal. │
// │ O caminho das duas fichas continua existindo para quem é demitido e      │
// │ recontratado pela outra empresa (rescisão de verdade).                   │
// └──────────────────────────────────────────────────────────────────────────┘
//
// O QUE VAI JUNTO (empresaId reescrito para o destino, com os anexos): tudo o
// que é da PESSOA e só faz sentido com ela — dossiê, contracheques e recibos
// assinados, férias, ausências/atestados, movimentações, NR, ASO, EPI,
// entregas, acidentes, ocorrências disciplinares, integração, metas e PDI
// individuais, e o cadastro de condutor da frota.
//
// O QUE FICA no CNPJ de origem: o que pendura num "pai" da empresa antiga ou é
// registro legal daquele empregador naquele período — avaliações (ciclo da
// empresa antiga), treinamentos (turma da empresa antiga), candidatura (vaga),
// informativos, reconhecimentos, eventos de folha, ponto (batidas, tratamentos,
// banco de horas, escala) e benefícios (o tipo de benefício é cadastro da
// empresa antiga — no destino o RH lança de novo). Como a ficha busca o
// histórico por colaboradorId, esses registros continuam aparecendo nela.
//
// Veículo (item 7): o carro e TODO o histórico dele vão juntos — documentos,
// multas, manutenções, consumo, financeiro, alocações e compra/venda. A placa
// continua única no sistema; o carro nunca fica em duas empresas.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Empresas ativas do mesmo grupo da empresa informada (inclui ela). */
export async function empresasDoMesmoGrupo(
  empresaId: string,
): Promise<{ id: string; nome: string; marca: string; marcaId: string }[]> {
  const origem = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { marca: { select: { grupoId: true } } },
  });
  if (!origem) return [];
  const empresas = await prisma.empresa.findMany({
    where: { ativo: true, marca: { grupoId: origem.marca.grupoId } },
    orderBy: [{ marca: { nome: "asc" } }, { nome: "asc" }],
    select: { id: true, nome: true, marcaId: true, marca: { select: { nome: true } } },
  });
  return empresas.map((e) => ({ id: e.id, nome: e.nome, marca: e.marca.nome, marcaId: e.marcaId }));
}

// Em série de propósito: a transação interativa usa UMA conexão, e o Prisma
// recomenda não disparar consultas em paralelo dentro dela.
async function emSerie(passos: (() => Promise<{ count: number }>)[]): Promise<number> {
  let total = 0;
  for (const p of passos) total += (await p()).count;
  return total;
}

/** Reescreve o empresaId dos anexos — sem isso o download responde 404 no CNPJ novo. */
async function moverArquivos(tx: Tx, ids: (string | null | undefined)[], destino: string): Promise<number> {
  const limpos = [...new Set(ids.filter((x): x is string => !!x))];
  if (limpos.length === 0) return 0;
  const r = await tx.arquivo.updateMany({ where: { id: { in: limpos } }, data: { empresaId: destino } });
  return r.count;
}

export type ResumoTransferencia = { registros: number; anexos: number };

/**
 * Move o histórico pessoal para `destino` (a ficha em si quem move é a action,
 * junto com setor e cargo). Roda DENTRO da transação de quem chama — a action
 * valida permissão, setor e cargo antes.
 */
export async function moverHistoricoDoColaborador(
  tx: Tx,
  colaboradorId: string,
  destino: string,
): Promise<ResumoTransferencia> {
  const doColab = { colaboradorId };
  const novo = { empresaId: destino };

  // Anexos primeiro (os ids saem dos registros que vão mudar).
  const ids: (string | null)[] = [];
  for (const d of await tx.documentoColaborador.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const r of await tx.reciboContracheque.findMany({
    where: doColab,
    select: { fotoArquivoId: true, comprovanteArquivoId: true },
  }))
    ids.push(r.fotoArquivoId, r.comprovanteArquivoId);
  for (const r of await tx.reciboContrachequeInvalidado.findMany({
    where: doColab,
    select: { fotoArquivoId: true, comprovanteArquivoId: true },
  }))
    ids.push(r.fotoArquivoId, r.comprovanteArquivoId);
  for (const d of await tx.ausencia.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.certificadoNR.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.exameOcupacional.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.entregaEPI.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.acidenteTrabalho.findMany({ where: doColab, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.ocorrenciaDisciplinar.findMany({ where: doColab, select: { arquivoId: true } }))
    ids.push(d.arquivoId);
  const anexos = await moverArquivos(tx, ids, destino);

  const registros = await emSerie([
    () => tx.documentoColaborador.updateMany({ where: doColab, data: novo }),
    () => tx.reciboContracheque.updateMany({ where: doColab, data: novo }),
    () => tx.reciboContrachequeInvalidado.updateMany({ where: doColab, data: novo }),
    () => tx.solicitacaoFerias.updateMany({ where: doColab, data: novo }),
    () => tx.ausencia.updateMany({ where: doColab, data: novo }),
    () => tx.movimentacao.updateMany({ where: doColab, data: novo }),
    () => tx.certificadoNR.updateMany({ where: doColab, data: novo }),
    () => tx.exameOcupacional.updateMany({ where: doColab, data: novo }),
    () => tx.entregaEPI.updateMany({ where: doColab, data: novo }),
    () => tx.entregaAoColaborador.updateMany({ where: doColab, data: novo }),
    () => tx.acidenteTrabalho.updateMany({ where: doColab, data: novo }),
    () => tx.ocorrenciaDisciplinar.updateMany({ where: doColab, data: novo }),
    () => tx.checklistIntegracao.updateMany({ where: doColab, data: novo }),
    () => tx.meta.updateMany({ where: doColab, data: novo }),
    () => tx.planoDesenvolvimento.updateMany({ where: doColab, data: novo }),
    () => tx.condutor.updateMany({ where: doColab, data: novo }),
  ]);

  return { registros, anexos };
}

/** Move o veículo e TODO o histórico dele para `destino`. */
export async function moverHistoricoDoVeiculo(
  tx: Tx,
  veiculoId: string,
  destino: string,
): Promise<ResumoTransferencia> {
  const doVeic = { veiculoId };
  const novo = { empresaId: destino };

  const ids: (string | null)[] = [];
  for (const d of await tx.documentoVeiculo.findMany({ where: doVeic, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.infracao.findMany({ where: doVeic, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.manutencaoVeiculo.findMany({ where: doVeic, select: { arquivoId: true } })) ids.push(d.arquivoId);
  for (const d of await tx.alocacaoVeiculo.findMany({ where: doVeic, select: { termoArquivoId: true } }))
    ids.push(d.termoArquivoId);
  for (const d of await tx.transferenciaVeiculo.findMany({ where: doVeic, select: { comprovanteArquivoId: true } }))
    ids.push(d.comprovanteArquivoId);
  const anexos = await moverArquivos(tx, ids, destino);

  await tx.veiculo.update({ where: { id: veiculoId }, data: novo });
  const registros =
    1 +
    (await emSerie([
      () => tx.documentoVeiculo.updateMany({ where: doVeic, data: novo }),
      () => tx.infracao.updateMany({ where: doVeic, data: novo }),
      () => tx.manutencaoVeiculo.updateMany({ where: doVeic, data: novo }),
      () => tx.consumoVeiculo.updateMany({ where: doVeic, data: novo }),
      () => tx.alocacaoVeiculo.updateMany({ where: doVeic, data: novo }),
      () => tx.transferenciaVeiculo.updateMany({ where: doVeic, data: novo }),
      () => tx.veiculoFinanceiro.updateMany({ where: doVeic, data: novo }),
    ]));

  return { registros, anexos };
}
