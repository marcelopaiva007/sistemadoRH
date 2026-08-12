"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listarAtualizacoes } from "@/lib/actions/atualizacoes";

type Atualizacao = {
  id: string;
  versao: string;
  titulo: string;
  descricao: string;
  dataSaida: string;
  autor: string | null;
  commit: string | null;
};

export default function AtualizacoesPage() {
  const [atualizacoes, setAtualizacoes] = useState<Atualizacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      const resultado = await listarAtualizacoes();
      if (resultado.ok) {
        setAtualizacoes(resultado.data || []);
      }
      setCarregando(false);
    }
    carregar();
  }, []);

  if (carregando) {
    return (
      <div className="container py-10">
        <div className="text-center">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Atualizações</h1>
        <p className="text-muted-foreground mt-2">Veja as novidades e mudanças do sistema</p>
      </div>

      <div className="space-y-6">
        {atualizacoes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">Nenhuma atualização registrada ainda</p>
            </CardContent>
          </Card>
        ) : (
          atualizacoes.map((atualizacao) => (
            <Card key={atualizacao.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                        v{atualizacao.versao}
                      </span>
                      <h3 className="text-xl font-semibold">{atualizacao.titulo}</h3>
                    </div>
                    <CardDescription className="mt-2">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span>
                          📅{" "}
                          {new Date(atualizacao.dataSaida).toLocaleDateString("pt-BR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                        {atualizacao.autor && <span>👤 {atualizacao.autor}</span>}
                        {atualizacao.commit && (
                          <span className="font-mono text-xs text-muted-foreground">
                            #{atualizacao.commit.slice(0, 7)}
                          </span>
                        )}
                      </div>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {atualizacao.descricao}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
