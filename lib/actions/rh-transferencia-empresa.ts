"use server";

// "Transferir para outra empresa do grupo" — OS 11/11/2026, item 6.
// A regra de o que vai junto e o que fica mora em lib/transferencia-empresa.ts.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { podeOperarEmpresaRH, requireEmpresaAccess, usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { empresasDoGrupo, grupoDoUsuario } from "@/lib/grupo";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { MOVIMENTACAO_TRANSFERENCIA_EMPRESA } from "@/lib/constants-movimentacao";
import { moverHistoricoDoColaborador } from "@/lib/transferencia-empresa";

export type ResultadoTransferenciaColaborador =
  | { ok: true; destinoUrl: string; registros: number; anexos: number }
  | { ok: false; error: string };

export async function transferirColaboradorEntreEmpresas(
  empresaId: string,
  colaboradorId: string,
  entrada: {
    empresaDestinoId: string;
    setorId: string;
    posicaoId: string;
    dataEfetiva: string;
    motivo?: string | null;
  },
): Promise<ResultadoTransferenciaColaborador> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: {
      id: true,
      nome: true,
      cpf: true,
      ativo: true,
      empresaId: true,
      empresa: { select: { nome: true } },
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  });
  if (!colab) return { ok: false, error: "Colaborador não encontrado." };
  // Origem: quem transfere precisa OPERAR o RH do CNPJ atual da ficha — a
  // mesma régua de qualquer gravação na ficha. O empresaId da URL não decide.
  if (!(await podeOperarEmpresaRH(usuario, colab.empresaId))) {
    return { ok: false, error: "Sem permissão para alterar colaboradores desta empresa." };
  }
  if (!colab.ativo) {
    return { ok: false, error: "Só ficha ativa pode ser transferida. Ficha encerrada fica onde está." };
  }

  const destino = entrada.empresaDestinoId;
  if (!destino || destino === colab.empresaId) {
    return { ok: false, error: "Escolha a empresa de destino (diferente da atual)." };
  }
  // Destino: QUALQUER empresa ativa do grupo de quem transfere — é o pedido
  // ("LM para VAPT" com logins diferentes por marca). A parede de grupo
  // continua: CNPJ de outro grupo é recusado aqui, mesmo num POST à mão.
  const doGrupo = await empresasDoGrupo(await grupoDoUsuario(usuario.id));
  if (!doGrupo.includes(destino)) {
    return { ok: false, error: "Empresa de destino fora do grupo." };
  }
  const empresaDestino = await prisma.empresa.findUnique({
    where: { id: destino },
    select: { nome: true, razaoSocial: true, ativo: true },
  });
  if (!empresaDestino?.ativo) return { ok: false, error: "Empresa de destino inativa." };

  // Setor e cargo da MARCA de destino (o catálogo é por marca).
  const escopoDestino = await empresasDaMesmaMarca(destino);
  const [setor, posicao] = await Promise.all([
    prisma.setor.findFirst({
      where: { id: entrada.setorId, empresaId: { in: escopoDestino }, ativo: true },
      select: { id: true, nome: true },
    }),
    prisma.posicao.findFirst({
      where: { id: entrada.posicaoId, empresaId: { in: escopoDestino }, ativo: true },
      select: { id: true, nome: true },
    }),
  ]);
  if (!setor) return { ok: false, error: "Escolha o setor na empresa de destino." };
  if (!posicao) return { ok: false, error: "Escolha o cargo na empresa de destino." };

  const dataEfetiva = dataDoFormulario(entrada.dataEfetiva);
  if (!dataEfetiva) return { ok: false, error: "Informe a data efetiva da transferência." };

  // CPF já cadastrado no destino = o caso das DUAS fichas (v1.184.0). Mover
  // aqui bateria na unique (empresaId, cpf) — e misturaria dois históricos.
  if (colab.cpf) {
    const jaNoDestino = await prisma.colaborador.findFirst({
      where: { empresaId: destino, cpf: colab.cpf, id: { not: colab.id } },
      select: { ativo: true },
    });
    if (jaNoDestino) {
      return {
        ok: false,
        error: jaNoDestino.ativo
          ? `Já existe uma ficha ATIVA com este CPF em ${empresaDestino.nome}. Use "Transferido" no desligamento da ficha antiga, ou encerre a ficha duplicada antes.`
          : `Já existe uma ficha encerrada com este CPF em ${empresaDestino.nome}. Fale com o suporte para unificar antes de transferir.`,
      };
    }
  }

  const motivo = (entrada.motivo ?? "").trim().slice(0, 500) || null;
  const resumo = await prisma.$transaction(
    async (tx) => {
      await tx.colaborador.update({
        where: { id: colab.id },
        data: {
          empresaId: destino,
          setorId: setor.id,
          posicaoId: posicao.id,
          // Quem assina a carteira passa a ser o CNPJ de destino.
          ...(empresaDestino.razaoSocial ? { razaoSocial: empresaDestino.razaoSocial } : {}),
        },
      });
      const r = await moverHistoricoDoColaborador(tx, colab.id, destino);
      await tx.movimentacao.create({
        data: {
          empresaId: destino,
          colaboradorId: colab.id,
          tipo: MOVIMENTACAO_TRANSFERENCIA_EMPRESA,
          dataEfetiva,
          empresaAnteriorId: colab.empresaId,
          empresaAnteriorNome: colab.empresa.nome,
          empresaNovaNome: empresaDestino.nome,
          setorAnteriorNome: colab.setor.nome,
          setorNovoId: setor.id,
          setorNovoNome: setor.nome,
          posicaoAnteriorNome: colab.posicao.nome,
          posicaoNovaId: posicao.id,
          posicaoNovaNome: posicao.nome,
          motivo,
          registradoPorId: usuario.id,
          registradoPorNome: usuario.name ?? null,
        },
      });
      return r;
    },
    { timeout: 30_000 },
  );

  const texto =
    `Transferiu ${colab.nome} de ${colab.empresa.nome} para ${empresaDestino.nome} ` +
    `(data efetiva ${formatarData(dataEfetiva)}): ${resumo.registros} registro(s) e ${resumo.anexos} anexo(s) foram junto.`;
  for (const e of [colab.empresaId, destino]) {
    await registrarAuditoria({
      empresaId: e,
      acao: "ATUALIZAR",
      entidade: "Colaborador",
      entidadeId: colab.id,
      resumo: texto,
      detalhes: { origem: colab.empresaId, destino, motivo, ...resumo },
    });
  }

  revalidatePath(`/rh/${colab.empresaId}/colaboradores`);
  revalidatePath(`/rh/${destino}/colaboradores`);
  // Quem não alcança o destino (login de uma marca só) volta para a lista da
  // origem — a ficha saiu dela.
  const alcancaDestino = await usuarioAlcancaEmpresa(usuario, destino);
  return {
    ok: true,
    destinoUrl: alcancaDestino ? `/rh/${destino}/colaboradores/${colab.id}` : `/rh/${empresaId}/colaboradores`,
    ...resumo,
  };
}
