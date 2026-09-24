/**
 * Componentes de Seções da Ficha — cada uma carrega independentemente
 * Uso com <Suspense> para streaming
 */

import { prisma } from "@/lib/prisma";
import { CardSkeleton, TableSkeleton } from "@/components/skeletons/card-skeleton";
import { Suspense } from "react";

// ============================================================================
// SEÇÃO 1: DADOS CADASTRAIS (Rápido, carrega logo)
// ============================================================================
export async function SecaoCadastral({ colaboradorId }: { colaboradorId: string }) {
  const dados = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: {
      nome: true,
      email: true,
      telefone: true,
      dataNascimento: true,
      cpf: true,
      rg: true,
      rgUf: true,
      cidade: true,
      cep: true,
    },
  });

  if (!dados) return <div>Dados cadastrais não encontrados</div>;

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Dados Cadastrais</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Nome</p>
          <p className="font-medium">{dados.nome}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          <p className="font-medium">{dados.email}</p>
        </div>
        {/* ... mais campos ... */}
      </div>
    </div>
  );
}

// ============================================================================
// SEÇÃO 2: DOCUMENTOS
// ============================================================================
async function DocumentosContent({ colaboradorId }: { colaboradorId: string }) {
  const documentos = await prisma.documentoColaborador.findMany({
    where: { colaboradorId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      tipo: true,
      descricao: true,
      emitidoEm: true,
      validoAte: true,
      observacoes: true,
      criadoPorNome: true,
      createdAt: true,
    },
  });

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Documentos</h3>
      {documentos.length === 0 ? (
        <p className="text-muted-foreground">Nenhum documento cadastrado</p>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <div key={doc.id} className="p-3 border rounded bg-muted/50">
              <p className="font-medium">{doc.tipo}</p>
              <p className="text-sm text-muted-foreground">{doc.descricao}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SecaoDocumentos({ colaboradorId }: { colaboradorId: string }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <DocumentosContent colaboradorId={colaboradorId} />
    </Suspense>
  );
}

// ============================================================================
// SEÇÃO 3: FÉRIAS E AUSÊNCIAS
// ============================================================================
async function FeriasAusenciasContent({ colaboradorId }: { colaboradorId: string }) {
  const [ferias, ausencias] = await Promise.all([
    prisma.solicitacaoFerias.findMany({
      where: { colaboradorId },
      orderBy: [{ dataInicio: "desc" }],
    }),
    prisma.ausencia.findMany({
      where: { colaboradorId },
      orderBy: [{ dataInicio: "desc" }],
    }),
  ]);

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Férias e Ausências</h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-2">Férias ({ferias.length})</h4>
          {ferias.slice(0, 3).map((f) => (
            <div key={f.id} className="text-sm text-muted-foreground mb-2">
              {/* Mostrar resumo */}
            </div>
          ))}
        </div>
        <div>
          <h4 className="font-medium mb-2">Ausências ({ausencias.length})</h4>
          {ausencias.slice(0, 3).map((a) => (
            <div key={a.id} className="text-sm text-muted-foreground mb-2">
              {/* Mostrar resumo */}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SecaoFeriasAusencias({ colaboradorId }: { colaboradorId: string }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <FeriasAusenciasContent colaboradorId={colaboradorId} />
    </Suspense>
  );
}

// ============================================================================
// SEÇÃO 4: SAÚDE E SEGURANÇA (NR-01)
// ============================================================================
async function SaudeSegurancaContent({ colaboradorId, posicaoId }: { colaboradorId: string; posicaoId: string }) {
  const [certificados, exames, requisitos] = await Promise.all([
    prisma.certificadoNR.findMany({
      where: { colaboradorId },
      orderBy: [{ realizadoEm: "desc" }],
    }),
    prisma.exameOcupacional.findMany({
      where: { colaboradorId },
      orderBy: [{ realizadoEm: "desc" }],
    }),
    prisma.requisitoNR.findMany({
      where: { posicaoId },
      orderBy: { norma: "asc" },
    }),
  ]);

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Saúde e Segurança</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Certificados NR ({certificados.length})</h4>
          {certificados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum certificado</p>}
        </div>
        <div>
          <h4 className="font-medium mb-2">Exames Ocupacionais ({exames.length})</h4>
          {exames.length === 0 && <p className="text-sm text-muted-foreground">Nenhum exame</p>}
        </div>
        <div>
          <h4 className="font-medium mb-2">Requisitos ({requisitos.length})</h4>
          {requisitos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum requisito</p>}
        </div>
      </div>
    </div>
  );
}

export function SecaoSaudeSeguranca({ colaboradorId, posicaoId }: { colaboradorId: string; posicaoId: string }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <SaudeSegurancaContent colaboradorId={colaboradorId} posicaoId={posicaoId} />
    </Suspense>
  );
}

// ============================================================================
// SEÇÃO 5: BENEFÍCIOS E EPI
// ============================================================================
async function BeneficiosEpiContent({ colaboradorId }: { colaboradorId: string }) {
  const [beneficios, epi] = await Promise.all([
    prisma.beneficioColaborador.findMany({
      where: { colaboradorId },
      orderBy: [{ dataFim: "asc" }, { dataInicio: "desc" }],
    }),
    prisma.entregaEPI.findMany({
      where: { colaboradorId },
      orderBy: [{ dataEntrega: "desc" }],
    }),
  ]);

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Benefícios e EPI</h3>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-2">Benefícios ({beneficios.length})</h4>
        </div>
        <div>
          <h4 className="font-medium mb-2">Entregas de EPI ({epi.length})</h4>
        </div>
      </div>
    </div>
  );
}

export function SecaoBeneficiosEpi({ colaboradorId }: { colaboradorId: string }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <BeneficiosEpiContent colaboradorId={colaboradorId} />
    </Suspense>
  );
}

// ============================================================================
// SEÇÃO 6: HISTÓRICO (Movimentações, Avaliações, Metas, PDI)
// ============================================================================
async function HistoricoContent({ colaboradorId }: { colaboradorId: string }) {
  const [movimentacoes, avaliacoes, metas, planosDesenvolvimento] = await Promise.all([
    prisma.movimentacao.findMany({
      where: { colaboradorId },
      orderBy: { dataEfetiva: "desc" },
    }),
    prisma.avaliacaoDesempenho.findMany({
      where: { colaboradorId },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.meta.findMany({
      where: { colaboradorId },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.planoDesenvolvimento.findMany({
      where: { colaboradorId },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Histórico</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Movimentações ({movimentacoes.length})</h4>
        </div>
        <div>
          <h4 className="font-medium mb-2">Avaliações ({avaliacoes.length})</h4>
        </div>
        <div>
          <h4 className="font-medium mb-2">Metas ({metas.length})</h4>
        </div>
        <div>
          <h4 className="font-medium mb-2">Planos de Desenvolvimento ({planosDesenvolvimento.length})</h4>
        </div>
      </div>
    </div>
  );
}

export function SecaoHistorico({ colaboradorId }: { colaboradorId: string }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <HistoricoContent colaboradorId={colaboradorId} />
    </Suspense>
  );
}
