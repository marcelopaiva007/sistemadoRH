import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { tipoContratoLabel } from "@/lib/constants-dp";

// Página PÚBLICA de carreiras: um endereço só para divulgar, com todas as
// vagas abertas do grupo. A inscrição em si continua em /vagas/<slug>.
//
// Sem sessão — ver a exceção em auth.config.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trabalhe conosco | Grupo LM Telecom",
  description:
    "Vagas abertas no grupo LM Telecom, Centrysol e VAPT. Candidate-se online, é rápido.",
};

export default async function CarreirasPage() {
  // Só o que está publicado E aberto. Vaga despublicada não aparece nem aqui
  // nem na página dela — mesma regra dos dois lados.
  const vagas = await prisma.vaga.findMany({
    where: { publicada: true, status: "ABERTA" },
    orderBy: [{ abertaEm: "desc" }],
    select: {
      slug: true,
      titulo: true,
      descricao: true,
      tipoContrato: true,
      faixaSalarial: true,
      quantidade: true,
      empresaId: true,
      setor: { select: { nome: true } },
    },
  });

  // O nome da empresa não vem por relação (Vaga guarda só empresaId, padrão
  // das fases 3+), então resolvemos em uma consulta só.
  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-muted-foreground">Grupo LM Telecom</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Trabalhe conosco</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          Somos um grupo de telecomunicações e energia com mais de 400 pessoas. Veja as vagas
          abertas e candidate-se — leva poucos minutos, e você não precisa criar conta.
        </p>
      </header>

      {vagas.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <Briefcase className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="font-medium">Nenhuma vaga aberta no momento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Não temos posições em aberto agora. Vale voltar aqui em algumas semanas.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {vagas.length === 1 ? "1 vaga aberta" : `${vagas.length} vagas abertas`}
          </p>
          <ul className="space-y-3">
            {vagas.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/vagas/${v.slug}`}
                  className="block rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-medium">{v.titulo}</h2>
                    <span className="text-xs text-muted-foreground">
                      {nomeDaEmpresa.get(v.empresaId) ?? ""}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {v.setor?.nome && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {v.setor.nome}
                      </span>
                    )}
                    {v.tipoContrato && <span>{tipoContratoLabel(v.tipoContrato)}</span>}
                    {v.faixaSalarial && <span>{v.faixaSalarial}</span>}
                    {v.quantidade > 1 && <span>{v.quantidade} posições</span>}
                  </div>

                  {v.descricao && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{v.descricao}</p>
                  )}

                  <span className="mt-3 inline-block text-sm font-medium text-primary">
                    Ver vaga e candidatar-se →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
        Os dados enviados na candidatura são usados apenas no processo seletivo e para futuras
        oportunidades do grupo. Você pode pedir a exclusão a qualquer momento.
      </footer>
    </main>
  );
}
