"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Radar de desvio — o primeiro bloco do painel.
 *
 * Todo o resto desta tela responde "quanto"; este bloco responde "isto é
 * normal?". A conta está em lib/anomalias.ts (Poisson contra a própria média
 * dos 12 meses anteriores) e chega aqui como frase pronta — a tela não
 * recalcula nada, só decide o que mostrar quando NÃO há alerta.
 *
 * O bloco NUNCA some. Um bloco que aparece só quando há problema ensina o
 * leitor que ausência de bloco é ausência de problema, e as duas coisas que
 * produzem "nenhum alerta" são opostas: testamos e está tudo dentro da média,
 * ou não deu para testar (unidade pequena demais, série curta demais). Os dois
 * estados vazios são diferentes aqui, e dizem qual dos dois é.
 */

/** Uma pessoa da lista nominal. Sem salário, sem documento — só o que identifica a saída. */
export type SaidaDoMes = {
  id: string;
  nome: string;
  empresa: string;
  setor: string;
  cargo: string;
  /** Já formatada no servidor (dd/mm/aaaa) — a tela não recebe Date para não depender de fuso. */
  data: string;
};

/** O que `lib/anomalias.ts` devolve, mais a lista nominal que a tela abre. */
export type AnomaliaNaTela = {
  frase: string;
  mes: string;
  nivel: string;
  unidadeId: string;
  unidadeNome: string;
  observado: number;
  esperado: number;
  p: number;
  mesesDeBaseline: number;
  mesIncompleto: boolean;
  saidas: SaidaDoMes[];
};

export type RadarDeDesvio = {
  anomalias: AnomaliaNaTela[];
  unidadesAvaliadas: number;
  mesesAvaliadosPorUnidade: number;
  /** Meses da série que o detector varreu — fixa, independente da janela da tela. */
  mesesDaSerie: number;
  /** Frases prontas da lib sobre o que ficou fora do teste. */
  avisos: string[];
};

export function RadarDesvio({
  radar,
  hrefCentral,
}: {
  radar: RadarDeDesvio;
  /** Rota da Central de Sinais — onde as MESMAS anomalias viram cartão com dono, prazo e desfecho. */
  hrefCentral?: string;
}) {
  // Uma linha aberta por vez: duas listas nominais abertas empurram o painel
  // inteiro para baixo e a comparação entre as frases se perde.
  const [aberta, setAberta] = useState<string | null>(null);

  const temAlerta = radar.anomalias.length > 0;
  const parasTestados = radar.unidadesAvaliadas * radar.mesesAvaliadosPorUnidade;

  return (
    <Card className={cn(temAlerta && "border-destructive/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {temAlerta ? (
            <TriangleAlert className="size-4 text-destructive" />
          ) : (
            <CircleCheck className="size-4 text-muted-foreground" />
          )}
          Radar de desvio
          {temAlerta && (
            <Badge variant="destructive" className="font-normal">
              {radar.anomalias.length}
            </Badge>
          )}
          {/* O radar mostra; a Central cobra. O link existe mesmo sem alerta:
              é lá que ficam os sinais antigos esperando desfecho. */}
          {hrefCentral && (
            <Link
              href={hrefCentral}
              className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              Abrir na Central de Sinais
              <ArrowRight className="size-3" />
            </Link>
          )}
        </CardTitle>
        <CardDescription>
          Cada CNPJ, marca e o grupo comparados com a <em>própria</em> média dos meses anteriores,
          na série de {radar.mesesDaSerie} meses — não com um limiar escrito à mão, que erra dos
          dois lados num grupo onde um CNPJ tem 4 pessoas e outro tem 68. Este bloco não segue a
          janela escolhida acima: o teste precisa dos 12 meses de baseline mais os meses avaliados.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {radar.unidadesAvaliadas === 0 ? (
          <EstadoVazio
            titulo="Não foi possível testar nenhuma unidade."
            texto="Nenhum CNPJ ou marca do recorte tem gente e histórico suficientes para o teste dizer alguma coisa. Isto não é 'nada fora do normal' — é ausência de medição."
            alerta
          />
        ) : !temAlerta ? (
          <EstadoVazio
            titulo="Nenhum mês fora do esperado."
            texto={
              `${parasTestados} combinações de unidade × mês testadas ` +
              `(${radar.unidadesAvaliadas} ${radar.unidadesAvaliadas === 1 ? "unidade" : "unidades"} × ` +
              `${radar.mesesAvaliadosPorUnidade} meses avaliáveis). Nenhuma ficou acima do que a própria ` +
              "média dos meses anteriores previa. O bloco continua aqui de propósito: some quando " +
              "houver desvio, e some quando não houver — a diferença é esta frase, não a ausência do bloco."
            }
          />
        ) : (
          <ul className="space-y-2">
            {radar.anomalias.map(a => (
              <LinhaDeAlerta
                key={`${a.nivel}:${a.unidadeId}:${a.mes}`}
                anomalia={a}
                aberta={aberta === `${a.nivel}:${a.unidadeId}:${a.mes}`}
                aoAlternar={() =>
                  setAberta(atual => {
                    const chave = `${a.nivel}:${a.unidadeId}:${a.mes}`;
                    return atual === chave ? null : chave;
                  })
                }
              />
            ))}
          </ul>
        )}

        {/* Os avisos da lib vão na tela sem reescrita: o assistente devolve
            exatamente estas frases, e duas redações para o mesmo fato é como
            um número começa a divergir de si mesmo entre telas. */}
        {radar.avisos.length > 0 && (
          <div className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <ul className="space-y-1">
              {radar.avisos.map(aviso => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------

function EstadoVazio({
  titulo,
  texto,
  alerta,
}: {
  titulo: string;
  texto: string;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 text-sm">
      {alerta ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
      )}
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function LinhaDeAlerta({
  anomalia,
  aberta,
  aoAlternar,
}: {
  anomalia: AnomaliaNaTela;
  aberta: boolean;
  aoAlternar: () => void;
}) {
  // A lista nominal é a razão de o alerta virar ação: "13 desligamentos" não
  // diz a quem ligar. Quando ela vem vazia é porque os desligamentos daquele
  // mês não têm nome recuperável no recorte — dizer isso é melhor do que abrir
  // uma tabela em branco.
  const podeAbrir = anomalia.saidas.length > 0;

  return (
    <li className="rounded-lg border">
      <div className="flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm">{anomalia.frase}</p>
          <p className="text-xs text-muted-foreground">
            {rotuloDoNivel(anomalia.nivel)} · esperado ~{formatarNumero(anomalia.esperado)} pela
            média de {anomalia.mesesDeBaseline} meses · {formatarP(anomalia.p)}
            {anomalia.mesIncompleto && " · mês ainda em curso"}
          </p>
        </div>
        <button
          type="button"
          onClick={aoAlternar}
          disabled={!podeAbrir}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
            podeAbrir ? "hover:bg-accent" : "cursor-not-allowed text-muted-foreground opacity-60"
          )}
        >
          {aberta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {podeAbrir ? `Ver quem saiu (${anomalia.saidas.length})` : "Sem nomes no recorte"}
        </button>
      </div>

      {aberta && podeAbrir && (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Saída</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalia.saidas.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{nomeExibicao(s.nome)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.empresa}</TableCell>
                  <TableCell className="text-muted-foreground">{s.setor}</TableCell>
                  <TableCell className="text-muted-foreground">{s.cargo}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.data}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {anomalia.saidas.length < anomalia.observado && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {anomalia.observado - anomalia.saidas.length} dos {anomalia.observado} desligamentos
              do mês não aparecem nesta lista — estão em CNPJ fora do filtro atual, mas contam no
              número da unidade.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function rotuloDoNivel(nivel: string): string {
  if (nivel === "grupo") return "Grupo";
  if (nivel === "marca") return "Marca";
  if (nivel === "empresa") return "CNPJ";
  return nivel;
}

/**
 * p pequeno vira "< 0,001". O leitor não decide nada com o sexto dígito, e
 * "4,71e-8" na tela parece defeito de formatação.
 */
function formatarP(p: number): string {
  if (p < 0.001) return "p < 0,001";
  return `p = ${p.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function formatarNumero(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);

// Os nomes vêm da importação em CAIXA ALTA. Mesma normalização de exibição do
// organograma e da tela de Liderança — só apresentação, o dado gravado não muda.
function nomeExibicao(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, i) =>
      i > 0 && CONECTIVOS.has(parte)
        ? parte
        : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1)
    )
    .join(" ");
}
