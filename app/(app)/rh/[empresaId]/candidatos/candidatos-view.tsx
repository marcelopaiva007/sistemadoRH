"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { etapaFunilLabel, origemCandidatoLabel } from "@/lib/constants-ats";
import { formatarData } from "@/lib/datas";

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
        <h2 className="text-xl font-semibold tracking-tight">Banco de talentos</h2>
        <p className="text-sm text-muted-foreground">
          Todo mundo que já se candidatou. Quem foi reprovado numa vaga continua aqui e pode ser
          chamado para outra sem recadastrar.
        </p>
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
                        <div className="font-medium">{c.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.cidade ?? "—"} · desde {formatarData(c.createdAt)}
                        </div>
                        {c.arquivo && (
                          <a
                            href={`/api/rh/${empresaId}/arquivos/${c.arquivo.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs hover:underline"
                          >
                            <FileText className="size-3" />
                            currículo
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.telefone ?? "—"}
                        {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {origemCandidatoLabel(c.origem)}
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
                          <Badge variant="default">Contratado</Badge>
                        ) : c.emProcesso ? (
                          <Badge variant="secondary">Em processo</Badge>
                        ) : (
                          <Badge variant="outline">Disponível</Badge>
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
