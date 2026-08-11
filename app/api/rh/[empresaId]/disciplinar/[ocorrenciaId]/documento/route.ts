// Entrega o documento formal de uma medida disciplinar (advertência,
// suspensão, termo de recusa etc.) pronto para imprimir e colher assinatura.
//
// Mesmo padrão das demais rotas de PDF do sistema: HTML server-side entregue
// ao navegador por lib/pdf-browser.ts, com a barra de "Imprimir / Salvar em
// PDF". Acesso validado também por MARCA (correção 1.63.5): quem alcança o
// CNPJ pelo vínculo de marca precisa conseguir abrir o documento.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";
import {
  gerarHtmlDocumentoDisciplinar,
  tituloDocumentoDisciplinar,
} from "@/lib/disciplinar-documento";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; ocorrenciaId: string }> },
) {
  const { empresaId, ocorrenciaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const idsDaMarca = await empresasDaMesmaMarca(empresaId);

  if (user.role === "ADMIN" || user.role === "DIRETORIA") {
    // Papéis globais: acesso a qualquer CNPJ.
  } else if (!user.empresas.some((e) => e.empresaId === empresaId && e.ativo)) {
    const temAcessoMarca = idsDaMarca.some((id) =>
      user.empresas.some((e) => e.empresaId === id && e.ativo),
    );
    if (!temAcessoMarca) {
      return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
    }
  }

  const ocorrencia = await prisma.ocorrenciaDisciplinar.findFirst({
    where: { id: ocorrenciaId, empresaId: { in: idsDaMarca } },
    include: {
      colaborador: {
        select: {
          nome: true,
          cpf: true,
          matricula: true,
          dataAdmissao: true,
          razaoSocial: true,
          posicao: { select: { nome: true } },
          setor: { select: { nome: true } },
        },
      },
      empresa: {
        select: { nome: true, razaoSocial: true, cnpj: true, cidade: true, uf: true },
      },
    },
  });

  if (!ocorrencia) {
    return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });
  }

  const dados = {
    ocorrencia: {
      tipo: ocorrencia.tipo,
      motivo: ocorrencia.motivo,
      detalhes: ocorrencia.detalhes,
      dataFato: ocorrencia.dataFato,
      diasSuspensao: ocorrencia.diasSuspensao,
      valorDesconto: ocorrencia.valorDesconto,
      statusAssinatura: ocorrencia.statusAssinatura,
      dataAssinatura: ocorrencia.dataAssinatura,
      emitidoPorNome: ocorrencia.emitidoPorNome,
      testemunha1Nome: ocorrencia.testemunha1Nome,
      testemunha1Cpf: ocorrencia.testemunha1Cpf,
      testemunha2Nome: ocorrencia.testemunha2Nome,
      testemunha2Cpf: ocorrencia.testemunha2Cpf,
      createdAt: ocorrencia.createdAt,
    },
    colaborador: {
      nome: ocorrencia.colaborador.nome,
      cpf: ocorrencia.colaborador.cpf,
      matricula: ocorrencia.colaborador.matricula,
      cargo: ocorrencia.colaborador.posicao?.nome ?? null,
      setor: ocorrencia.colaborador.setor?.nome ?? null,
      dataAdmissao: ocorrencia.colaborador.dataAdmissao,
    },
    empresa: {
      nome: ocorrencia.empresa.nome,
      // A carteira do colaborador pode ser assinada por outra razão social do
      // grupo (Colaborador.razaoSocial). É essa que tem de constar no papel.
      razaoSocial: ocorrencia.colaborador.razaoSocial ?? ocorrencia.empresa.razaoSocial,
      cnpj: ocorrencia.empresa.cnpj,
      cidade: ocorrencia.empresa.cidade,
      uf: ocorrencia.empresa.uf,
    },
  };

  return responderComHtmlRelatorio(
    gerarHtmlDocumentoDisciplinar(dados),
    tituloDocumentoDisciplinar(dados),
  );
}
