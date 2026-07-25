"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tipoContratoLabel } from "@/lib/constants-dp";
import { formatarData, tempoDeCasa } from "@/lib/datas";
import type { ResumoFerias } from "@/lib/ferias";
import { FichaBlocos } from "./ficha-blocos";
import { DependentesCard } from "./dependentes-card";
import { DocumentosCard } from "./documentos-card";
import { FeriasCard } from "./ferias-card";
import { AusenciasCard } from "./ausencias-card";

type Colaborador = Parameters<typeof FichaBlocos>[0]["colaborador"] & {
  ativo: boolean;
  telegramChatId: string | null;
  setor: { nome: string };
  posicao: { nome: string };
};

export function ColaboradorDetalhe({
  empresaId,
  colaborador,
  dependentes,
  documentos,
  ferias,
  ausencias,
  resumoFerias,
}: {
  empresaId: string;
  colaborador: Colaborador;
  dependentes: Parameters<typeof DependentesCard>[0]["dependentes"];
  documentos: Parameters<typeof DocumentosCard>[0]["documentos"];
  ferias: Parameters<typeof FeriasCard>[0]["solicitacoes"];
  ausencias: Parameters<typeof AusenciasCard>[0]["ausencias"];
  resumoFerias: ResumoFerias | null;
}) {
  const pendencias =
    ferias.filter((f) => f.status === "PENDENTE").length +
    ausencias.filter((a) => a.status === "PENDENTE").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{colaborador.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {colaborador.setor.nome} · {colaborador.posicao.nome}
            {colaborador.matricula && ` · matrícula ${colaborador.matricula}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={colaborador.ativo ? "default" : "secondary"}>
            {colaborador.ativo ? "Ativo" : "Inativo"}
          </Badge>
          {colaborador.tipoContrato && (
            <Badge variant="outline">{tipoContratoLabel(colaborador.tipoContrato)}</Badge>
          )}
          {colaborador.telegramChatId && <Badge variant="secondary">Telegram vinculado</Badge>}
          {resumoFerias?.temVencido && <Badge variant="destructive">Férias vencidas</Badge>}
          {!resumoFerias?.temVencido && resumoFerias?.temVencendo && (
            <Badge variant="secondary">Férias vencendo</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo label="Admissão" valor={formatarData(colaborador.dataAdmissao)} />
        <Resumo
          label="Tempo de casa"
          valor={colaborador.dataAdmissao ? tempoDeCasa(colaborador.dataAdmissao) : "—"}
        />
        <Resumo
          label="Saldo de férias"
          valor={resumoFerias ? `${resumoFerias.saldoDisponivel} dias` : "—"}
        />
        <Resumo label="Pendências de aprovação" valor={pendencias > 0 ? `${pendencias}` : "nenhuma"} />
      </div>

      <Tabs defaultValue="ficha">
        <TabsList variant="line">
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="dependentes">Dependentes ({dependentes.length})</TabsTrigger>
          <TabsTrigger value="dossie">Dossiê ({documentos.length})</TabsTrigger>
          <TabsTrigger value="ferias">Férias</TabsTrigger>
          <TabsTrigger value="ausencias">Ausências ({ausencias.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ficha" className="pt-4">
          <FichaBlocos empresaId={empresaId} colaborador={colaborador} />
        </TabsContent>
        <TabsContent value="dependentes" className="pt-4">
          <DependentesCard empresaId={empresaId} colaboradorId={colaborador.id} dependentes={dependentes} />
        </TabsContent>
        <TabsContent value="dossie" className="pt-4">
          <DocumentosCard empresaId={empresaId} colaboradorId={colaborador.id} documentos={documentos} />
        </TabsContent>
        <TabsContent value="ferias" className="pt-4">
          <FeriasCard
            empresaId={empresaId}
            colaboradorId={colaborador.id}
            solicitacoes={ferias}
            resumo={resumoFerias}
          />
        </TabsContent>
        <TabsContent value="ausencias" className="pt-4">
          <AusenciasCard empresaId={empresaId} colaboradorId={colaborador.id} ausencias={ausencias} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
