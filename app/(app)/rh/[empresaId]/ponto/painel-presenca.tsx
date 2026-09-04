"use client";

import { useState } from "react";
import { Clock, UserCheck, LogOut, UserX, Search, ShieldCheck, Camera, CameraOff, UserRound, FileEdit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type PresenteItem = {
  colaboradorId: string;
  nome: string;
  setor: string;
  cargo: string;
  status: "PRESENTE" | "EM_INTERVALO" | "SAIU" | "AUSENTE";
  primeiraEntrada?: string | null;
  ultimaSaida?: string | null;
  // Cada batida do dia, com hora e se tem foto. A foto é o que responde "foi
  // ele mesmo que bateu?" — clicar abre pela rota autenticada, que audita.
  // `origem` TRATAMENTO = marcação incluída pelo RH por tratamento aprovado
  // (rh.MarcacaoTratada), não batida do REP-P: sem foto por natureza e fora do AFD.
  batidas: Array<{ id: string; hora: string; temFoto: boolean; origem: "BATIDA" | "TRATAMENTO" }>;
  /** Tem foto de referência na ficha — sem ela não há com o que comparar. */
  temReferencia: boolean;
  /** A referência já passou por um par de olhos do RH (ver Colaborador.fotoConferidaPeloRh). */
  referenciaConferida: boolean;
};

export function PainelPresencaView({
  colaboradores,
  empresaId,
}: {
  colaboradores: PresenteItem[];
  empresaId: string;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = colaboradores.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.setor.toLowerCase().includes(busca.toLowerCase()) ||
      c.cargo.toLowerCase().includes(busca.toLowerCase())
  );

  const totalPresentes = colaboradores.filter((c) => c.status === "PRESENTE").length;
  const totalIntervalo = colaboradores.filter((c) => c.status === "EM_INTERVALO").length;
  // "Atrasados" saiu daqui e nao volta enquanto nao existir vinculo entre
  // Colaborador e JornadaTrabalho no schema: sem horario contratual de
  // ninguem, nao ha com o que comparar a hora da entrada, e o contador vivia
  // marcando 0 como se fosse boa noticia. No lugar entra um numero que existe
  // de fato — quem ja bateu a saida final e encerrou a jornada.
  const totalSaiu = colaboradores.filter((c) => c.status === "SAIU").length;
  const totalAusentes = colaboradores.filter((c) => c.status === "AUSENTE").length;

  const badgeStatus = (status: string) => {
    switch (status) {
      case "PRESENTE":
        return <Badge variant="default" className="bg-success hover:bg-success">Presente</Badge>;
      case "EM_INTERVALO":
        return <Badge variant="secondary" className="bg-card text-muted-foreground">Em Almoço/Intervalo</Badge>;
      case "SAIU":
        return <Badge variant="outline" className="text-foreground">Saiu</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Ausente / Sem Batida</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Cards de Métricas em Tempo Real */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 bg-card border-success">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Presentes Agora</span>
            <UserCheck className="w-4 h-4 text-success" />
          </div>
          <span className="text-2xl font-extrabold text-success font-mono mt-1 block">
            {totalPresentes}
          </span>
        </Card>

        <Card className="p-3 bg-card border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Em Intervalo</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-2xl font-extrabold text-muted-foreground font-mono mt-1 block">
            {totalIntervalo}
          </span>
        </Card>

        <Card className="p-3 bg-card border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Saíram</span>
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-2xl font-extrabold text-foreground font-mono mt-1 block">
            {totalSaiu}
          </span>
        </Card>

        <Card className="p-3 bg-muted/40 border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Ausentes / Folga</span>
            <UserX className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-2xl font-extrabold text-foreground font-mono mt-1 block">{totalAusentes}</span>
        </Card>
      </div>

      {/* Busca e Lista de Presença */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Monitor de Presença em Tempo Real
            </CardTitle>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar colaborador ou setor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtrados.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum registro localizado.</p>
            ) : (
              filtrados.map((item) => (
                <div key={item.colaboradorId} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-foreground block">{item.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.setor} · {item.cargo}
                    </span>
                    {/* As batidas do dia, com a foto de cada uma. Batida sem
                        foto fica visível de propósito: silêncio aqui faria
                        "sem foto" parecer "está tudo bem".

                        A referência vem PRIMEIRO na linha, e não por capricho
                        de layout: comparar exige ter o rosto certo à esquerda
                        antes de olhar os da direita. */}
                    {item.batidas.length > 0 && (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.temReferencia ? (
                          <a
                            href={`/api/rh/${empresaId}/colaboradores/${item.colaboradorId}/foto`}
                            target="_blank"
                            rel="noreferrer"
                            title={
                              item.referenciaConferida
                                ? "Foto de referência da ficha (conferida pelo RH)"
                                : "Foto de referência adotada da 1ª batida — ainda NÃO conferida pelo RH"
                            }
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent ${
                              item.referenciaConferida
                                ? "border-primary/40 text-foreground"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            <UserRound className="w-3 h-3" />
                            referência
                            {!item.referenciaConferida && " (a conferir)"}
                          </a>
                        ) : (
                          <span
                            title="Sem foto de referência na ficha — não há com o que comparar as batidas"
                            className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <UserRound className="w-3 h-3" />
                            sem referência
                          </span>
                        )}
                        <span className="text-muted-foreground">·</span>
                        {item.batidas.map((b) =>
                          b.origem === "TRATAMENTO" ? (
                            // Incluída pelo RH (PTRP aprovado): não é batida, não
                            // tem foto para abrir e não entra no AFD. Tracejado
                            // como o "sem foto", mas com rótulo próprio — sem ele
                            // o RH leria a própria decisão como batida sem selfie.
                            <span
                              key={b.id}
                              title="Marcação incluída pelo RH por tratamento aprovado (PTRP) — não é batida do REP-P e não entra no AFD"
                              className="inline-flex items-center gap-1 rounded border border-dashed border-primary/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              <FileEdit className="w-3 h-3 text-primary" />
                              {b.hora}
                              <span className="font-sans">incluída pelo RH</span>
                            </span>
                          ) : b.temFoto ? (
                            <a
                              key={b.id}
                              href={`/api/rh/${empresaId}/ponto/${b.id}/foto`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver a foto tirada nesta batida"
                              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono text-foreground hover:bg-accent"
                            >
                              <Camera className="w-3 h-3 text-primary" />
                              {b.hora}
                            </a>
                          ) : (
                            <span
                              key={b.id}
                              title="Batida registrada sem foto"
                              className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              <CameraOff className="w-3 h-3" />
                              {b.hora}
                            </span>
                          ),
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right text-xs text-muted-foreground font-mono">
                      <div>1ª Ent: {item.primeiraEntrada || "—"}</div>
                      <div>Últ Saí: {item.ultimaSaida || "—"}</div>
                    </div>
                    {badgeStatus(item.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
