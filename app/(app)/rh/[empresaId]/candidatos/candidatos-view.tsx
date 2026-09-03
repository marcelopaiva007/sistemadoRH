"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Award, Clock, FileText, Search, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Paginacao } from "@/components/paginacao";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { usePaginacao } from "@/lib/use-paginacao";
import { etapaFunilLabel, origemCandidatoLabel } from "@/lib/constants-ats";
import { formatarData } from "@/lib/datas";
import { cn } from "@/lib/utils";

function KpiCard({
  rotulo,
  valor,
  icone: Icone,
}: {
  rotulo: string;
  valor: number | string;
  icone: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icone className="size-4.5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
      </div>
    </div>
  );
}

function AvatarIniciais({ nome, id }: { nome: string; id: string }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  const codigo = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cores = [
    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  ];
  const cor = cores[codigo % cores.length];
  return (
    <Avatar size="sm">
      <AvatarFallback className={cn("text-[10px] font-semibold", cor)}>
        {iniciais.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

type Candidatura = {
  id: string;
  etapa: string;
  updatedAt: Date;
  vaga: { id: string; titulo: string };
};

type Candidato = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  origem: string;
  createdAt: Date;
  arquivo: { id: string; nome: string } | null;
  candidaturas: Candidatura[];
  emProcesso: boolean;
  jaContratado: boolean;
};

export function CandidatosView({
  empresaId,
  candidatos,
  busca,
  soDisponiveis,
}: {
  empresaId: string;
  candidatos: Candidato[];
  busca: string;
  soDisponiveis: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [termo, setTermo] = useState(busca);
  const { itensDaPagina: candidatosNaPagina, resetar, ...paginacao } = usePaginacao(candidatos);

  const totais = useMemo(() => {
    const total = candidatos.length;
    const disponiveis = candidatos.filter((c) => !c.emProcesso && !c.jaContratado).length;
    const emProcesso = candidatos.filter((c) => c.emProcesso).length;
    const contratados = candidatos.filter((c) => c.jaContratado).length;
    return { total, disponiveis, emProcesso, contratados };
  }, [candidatos]);

  function aplicar(novoTermo: string, disponivel: boolean) {
    const p = new URLSearchParams(searchParams.toString());
    if (novoTermo.trim()) p.set("q", novoTermo.trim());
    else p.delete("q");
    if (disponivel) p.set("disponivel", "1");
    else p.delete("disponivel");
    resetar();
    router.push(`/rh/${empresaId}/candidatos?${p.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Banco de talentos</h1>
        <p className="text-sm text-muted-foreground">
          Todo mundo que já se candidatou. Quem foi reprovado numa vaga continua aqui e pode ser
          chamado para outra sem recadastrar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard rotulo="Total no banco" valor={totais.total} icone={Users} />
        <KpiCard rotulo="Disponíveis" valor={totais.disponiveis} icone={UserCheck} />
        <KpiCard rotulo="Em processo" valor={totais.emProcesso} icone={Clock} />
        <KpiCard rotulo="Contratados" valor={totais.contratados} icone={Award} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(termo, soDisponiveis);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-64 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome, e-mail, cidade, telefone ou CPF"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        <Button
          type="button"
          variant={soDisponiveis ? "default" : "outline"}
          onClick={() => aplicar(termo, !soDisponiveis)}
        >
          {soDisponiveis ? "Mostrando só disponíveis" : "Só disponíveis"}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {candidatos.length} candidato(s)
            {busca && <span className="ml-2 text-sm font-normal text-muted-foreground">para “{busca}”</span>}
          </CardTitle>
          <CardDescription>
            &quot;Disponível&quot; é quem não está em processo ativo nem foi contratado. Mostra no máximo 200.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidatos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {busca
                ? "Nenhum candidato encontrado para essa busca."
                : "Nenhum candidato cadastrado ainda. Eles entram pela página pública da vaga ou pelo cadastro no funil."}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Histórico</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidatosNaPagina.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <AvatarIniciais nome={c.nome} id={c.id} />
                          <div>
                            <div className="font-medium">{c.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.cidade ?? "—"} · desde {formatarData(c.createdAt)}
                            </div>
                            {c.arquivo && (
                              <a
                                href={`/api/rh/${empresaId}/arquivos/${c.arquivo.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-xs hover:underline text-primary"
                              >
                                <FileText className="size-3" />
                                currículo
                              </a>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.telefone ?? "—"}
                        {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {origemCandidatoLabel(c.origem)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.candidaturas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {c.candidaturas.slice(0, 3).map((cd) => (
                              <li key={cd.id} className="text-xs">
                                <Link
                                  href={`/rh/${empresaId}/vagas/${cd.vaga.id}`}
                                  className="hover:underline"
                                >
                                  {cd.vaga.titulo}
                                </Link>
                                <span className="ml-1 text-muted-foreground">
                                  — {etapaFunilLabel(cd.etapa)}
                                </span>
                              </li>
                            ))}
                            {c.candidaturas.length > 3 && (
                              <li className="text-xs text-muted-foreground">
                                +{c.candidaturas.length - 3} outra(s)
                              </li>
                            )}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.jaContratado ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Contratado</Badge>
                        ) : c.emProcesso ? (
                          <Badge variant="secondary" className="text-sky-700 dark:text-sky-300">
                            Em processo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                          >
                            Disponível
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={paginacao.total}
              porPagina={paginacao.porPagina}
              paginaAtual={paginacao.paginaAtual}
              totalPaginas={paginacao.totalPaginas}
              onMudarPagina={paginacao.irPara}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
