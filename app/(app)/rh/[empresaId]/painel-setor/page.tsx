import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactRound, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { chaveDeSetor, montarPainelDoSetor, montarPlacarDosSetores, setoresComGente } from "@/lib/painel-setor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PainelSetorView } from "./painel-setor-view";
import { SeletorSetor } from "./seletor-setor";

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

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
  // mão não pode abrir recorte que o seletor não ofereceria. A comparação usa
  // a mesma chave normalizada do motor (caixa/espaço não separam setores).
  const setorNome =
    (setorParam && setores.find((s) => chaveDeSetor(s.nome) === chaveDeSetor(setorParam))?.nome) ??
    setores[0]?.nome ??
    null;
  const rotuloEscopo = escopo.length === 1 ? "a empresa" : "o grupo";

  const [painel, placar] = await Promise.all([
    setorNome ? montarPainelDoSetor({ empresaIds: escopo, setorNome, janelaMeses }) : Promise.resolve(null),
    montarPlacarDosSetores({ empresaIds: escopo, janelaMeses }),
  ]);

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

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Todos os setores, lado a lado</CardTitle>
              <CardDescription>
                Uma linha por setor, pela mesma régua do detalhe abaixo. Clique num setor para
                abrir a análise dele.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-right">Ativos</TableHead>
                    <TableHead className="text-right">Turnover ({janelaMeses}m)</TableHead>
                    <TableHead className="text-right">Entradas × saídas</TableHead>
                    <TableHead className="text-right">Férias vencidas</TableHead>
                    <TableHead className="text-right">Sem avaliação</TableHead>
                    <TableHead className="text-right">&lt; 1 ano de casa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placar.linhas.map((l) => {
                    const selecionado = l.nome === painel.setorNome;
                    const params = new URLSearchParams();
                    params.set("setor", l.nome);
                    if (janelaMeses !== 12) params.set("janela", String(janelaMeses));
                    if (empresasParam) params.set("empresas", empresasParam);
                    return (
                      <TableRow key={l.nome} className={cn(selecionado && "bg-primary/5")}>
                        <TableCell className="font-medium">
                          <Link
                            href={`${base}/painel-setor?${params.toString()}`}
                            className={cn(
                              "underline-offset-2 hover:underline",
                              selecionado && "text-primary dark:text-foreground",
                            )}
                          >
                            {l.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.ativos}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.turnoverPct > placar.escopo.turnoverPct && l.turnoverPct > 20 ? (
                            <span className="font-semibold text-warning">{pct(l.turnoverPct)}</span>
                          ) : (
                            pct(l.turnoverPct)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.admissoes} × {l.desligamentos}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.feriasVencidas > 0 ? (
                            <span className="font-semibold text-destructive">{l.feriasVencidas}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.comCicloAberto > 0 ? (
                            l.semAvaliacao > 0 ? (
                              <span className="font-semibold text-warning">{l.semAvaliacao}</span>
                            ) : (
                              "0"
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{pct(l.pctAbaixoDeUmAno)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-medium">
                    <TableCell>{placar.escopo.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{placar.escopo.ativos}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(placar.escopo.turnoverPct)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {placar.escopo.admissoes} × {placar.escopo.desligamentos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{placar.escopo.feriasVencidas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {placar.escopo.comCicloAberto > 0 ? placar.escopo.semAvaliacao : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(placar.escopo.pctAbaixoDeUmAno)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
