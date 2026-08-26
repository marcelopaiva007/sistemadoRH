import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactRound, LayoutDashboard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { montarPainelDoSetor, setoresComGente } from "@/lib/painel-setor";
import { Card, CardContent } from "@/components/ui/card";
import { PainelSetorView } from "./painel-setor-view";
import { SeletorSetor } from "./seletor-setor";

// Painel do Setor — a porta de DIRETORIA/RH: escolhe-se um setor e lê-se a
// gestão dele (quadro, turnover, férias, avaliações, evolução), comparada com
// o conjunto de empresas do escopo. O gestor de setor lê OS MESMOS números do
// setor dele em /rh/meu-setor — duas portas, um motor (lib/painel-setor.ts).
//
// A divisão com as vizinhas do grupo Gestão: o Painel executivo responde "como
// está o grupo"; o Placar, "qual CNPJ destoa"; esta tela responde "como está
// ESTE setor" — o recorte que um gerente de setor cobra e que nenhuma das
// outras entrega.
export default async function PainelSetorPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string; setor?: string; janela?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam, setor: setorParam, janela: janelaParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const [empresa, setores] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    setoresComGente(escopo),
  ]);
  if (!empresa) notFound();

  const janelaMeses = [3, 6, 12, 24].includes(Number(janelaParam)) ? Number(janelaParam) : 12;
  // O setor pedido na URL só vale se existir no escopo — id ou nome digitado à
  // mão não pode abrir recorte que o seletor não ofereceria.
  const setorNome = setores.find((s) => s.nome === setorParam)?.nome ?? setores[0]?.nome ?? null;
  const rotuloEscopo = escopo.length === 1 ? "a empresa" : "o grupo";

  const painel = setorNome
    ? await montarPainelDoSetor({ empresaIds: escopo, setorNome, janelaMeses })
    : null;

  const base = `/rh/${empresaId}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Painel do setor</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A gestão de um setor num olhar: quadro, entradas e saídas, férias, avaliações e a
          comparação com {rotuloEscopo}. O gestor do setor vê estes mesmos números em Meu Setor.
        </p>
      </div>

      {setores.length === 0 || !painel ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum setor com gente ativa no escopo selecionado.
          </CardContent>
        </Card>
      ) : (
        <>
          <SeletorSetor setores={setores} setorAtual={painel.setorNome} janelaAtual={janelaMeses} />
          <PainelSetorView painel={painel} rotuloEscopo={rotuloEscopo} />
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/time`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ContactRound className="size-4 text-muted-foreground" />
              Ver as pessoas (Meu time)
            </Link>
            <Link
              href={`${base}/painel`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              Painel executivo (grupo)
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
