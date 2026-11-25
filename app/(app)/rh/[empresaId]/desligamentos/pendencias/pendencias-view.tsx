"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import type { PendenciaDeDado, PendenciasDeDados } from "@/lib/desligamentos/analises";
import type { FiltrosDaArea } from "@/lib/desligamentos/area";
import { FiltrosDaAreaBarra } from "../filtros-da-area";

/** Cada tipo de pendência: o que falta, o que isso estraga e onde corrigir. */
const SECOES: { chave: keyof PendenciasDeDados; titulo: string; curto: string; consequencia: string; comoCorrigir: string }[] = [
  {
    chave: "setorNaoDefinido",
    titulo: "Saídas com setor \"Não definido\"",
    curto: "Setor não definido",
    consequencia: "Não aparecem em setor nenhum de verdade — o quadro por setor fica incompleto.",
    comoCorrigir: "Abra a ficha e corrija o setor no bloco de estrutura.",
  },
  {
    chave: "semMotivo",
    titulo: "Saídas sem motivo legal",
    curto: "Sem motivo legal",
    consequencia: "Ficam fora de \"empresa × pedido\" e do aviso prévio e prazo da rescisão.",
    comoCorrigir: "Abra a ficha (bloco Vínculo) ou use o lápis da aba Registros.",
  },
  {
    chave: "semCausa",
    titulo: "Saídas sem causa da saída",
    curto: "Sem causa",
    consequencia: "Aparecem como \"sem causa registrada\" na aba Motivos — não dá para dizer se foi desempenho, comportamento...",
    comoCorrigir: "Abra a ficha (bloco Vínculo) ou use o lápis da aba Registros.",
  },
  {
    chave: "semData",
    titulo: "Desligados sem data de saída",
    curto: "Sem data de saída",
    consequencia: "Não entram em conta nenhuma — nem turnover, nem custo, nem meta.",
    comoCorrigir: "Abra a ficha e preencha a data de desligamento no bloco Vínculo.",
  },
  {
    chave: "possivelTransferencia",
    titulo: "Saídas que parecem transferência não marcada",
    curto: "Talvez transferência",
    consequencia:
      "O mesmo CPF foi admitido em outro CNPJ do grupo logo depois da saída. Se foi transferência, hoje conta como desligamento e como admissão — o turnover sai maior do que é.",
    comoCorrigir: "Confira e, se for o caso, troque o motivo para \"Transferência para outro CNPJ do grupo\".",
  },
];

export function PendenciasView({
  empresaId,
  pendencias,
  filtros,
  nomeDoRecorte,
}: {
  empresaId: string;
  pendencias: PendenciasDeDados;
  filtros: FiltrosDaArea;
  nomeDoRecorte: string | null;
}) {
  const total = SECOES.reduce((t, s) => t + pendencias[s.chave].length, 0);
  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Pendências de dados"
        resumo={
          total === 0 ? (
            "Nenhuma pendência — todas as saídas têm setor, motivo, causa e data."
          ) : (
            <>
              {total} pendência(s){nomeDoRecorte ? ` no ${nomeDoRecorte}` : ""} que deixam as outras abas incompletas. Todo o
              histórico, não só o período.
            </>
          )
        }
      />

      <FiltrosDaAreaBarra filtros={filtros} mostrarPeriodo={false} />

      <FaixaDeIndicadores colunas={5}>
        {SECOES.map((s) => (
          <Indicador
            key={s.chave}
            rotulo={s.curto}
            valor={pendencias[s.chave].length}
            estado={pendencias[s.chave].length > 0 ? "atencao" : "padrao"}
          />
        ))}
      </FaixaDeIndicadores>

      {SECOES.filter((s) => pendencias[s.chave].length > 0).map((s) => (
        <SecaoPendencia key={s.chave} empresaIdDaRota={empresaId} titulo={s.titulo} consequencia={s.consequencia} comoCorrigir={s.comoCorrigir} itens={pendencias[s.chave]} />
      ))}
    </div>
  );
}

function SecaoPendencia({
  empresaIdDaRota,
  titulo,
  consequencia,
  comoCorrigir,
  itens,
}: {
  empresaIdDaRota: string;
  titulo: string;
  consequencia: string;
  comoCorrigir: string;
  itens: PendenciaDeDado[];
}) {
  const { itensDaPagina, ...paginacao } = usePaginacao(itens);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {titulo} <span className="font-normal text-muted-foreground tabular-nums">({itens.length})</span>
        </CardTitle>
        <CardDescription>
          {consequencia} {comoCorrigir}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table compacta>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Setor em que conta</TableHead>
              <TableHead className="text-right">Corrigir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensDaPagina.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{p.data ?? <span className="text-muted-foreground">sem data</span>}</TableCell>
                <TableCell className="text-muted-foreground">{p.setor}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/rh/${p.empresaId}/colaboradores/${p.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                    Abrir ficha
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {itens.length > paginacao.porPagina && (
          <div className="mt-4">
            <Paginacao
              total={paginacao.total}
              porPagina={paginacao.porPagina}
              paginaAtual={paginacao.paginaAtual}
              totalPaginas={paginacao.totalPaginas}
              onMudarPagina={paginacao.irPara}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Motivo e causa também se corrigem pelo lápis de cada linha da aba{" "}
          <Link href={`/rh/${empresaIdDaRota}/desligamentos/registros`} className="underline-offset-2 hover:underline">
            Registros
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
