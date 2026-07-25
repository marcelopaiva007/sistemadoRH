import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tipoContratoLabel } from "@/lib/constants-dp";
import { InscricaoPublica } from "./inscricao-publica";

// Página PÚBLICA de inscrição (Fase 4). Sem sessão — ver a exceção em
// auth.config.ts e a action em lib/actions/vagas-publico.ts.
export const dynamic = "force-dynamic";

export default async function VagaPublicaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const vaga = await prisma.vaga.findUnique({
    where: { slug },
    select: {
      empresaId: true,
      titulo: true,
      descricao: true,
      requisitos: true,
      tipoContrato: true,
      faixaSalarial: true,
      status: true,
      publicada: true,
      setor: { select: { nome: true } },
    },
  });

  // Vaga despublicada some por completo — não confirma nem que o slug existiu.
  if (!vaga || !vaga.publicada) notFound();

  const empresa = await prisma.empresa.findUnique({
    where: { id: vaga.empresaId },
    select: { nome: true },
  });

  const aceitandoInscricao = vaga.status === "ABERTA";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">{empresa?.nome ?? ""}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{vaga.titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vaga.setor?.nome ?? "—"}
          {vaga.tipoContrato && ` · ${tipoContratoLabel(vaga.tipoContrato)}`}
          {vaga.faixaSalarial && ` · ${vaga.faixaSalarial}`}
        </p>
      </div>

      {vaga.descricao && (
        <section className="mb-5">
          <h2 className="mb-1 text-sm font-medium">Sobre a vaga</h2>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{vaga.descricao}</p>
        </section>
      )}
      {vaga.requisitos && (
        <section className="mb-5">
          <h2 className="mb-1 text-sm font-medium">Requisitos</h2>
          <p className="text-sm whitespace-pre-line text-muted-foreground">{vaga.requisitos}</p>
        </section>
      )}

      {aceitandoInscricao ? (
        <InscricaoPublica slug={slug} empresaNome={empresa?.nome ?? ""} />
      ) : (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Esta vaga não está mais recebendo inscrições.
        </div>
      )}
    </main>
  );
}
