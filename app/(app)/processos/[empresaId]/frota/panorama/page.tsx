import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BarChart3, Car, LayoutDashboard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { hojeUTC } from "@/lib/datas";
import { MOTORIZACAO_VEICULO, PROPRIEDADE_VEICULO, camposFaltandoNoVeiculo } from "@/lib/processos/ctb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import { GraficoBarras, type Fatia } from "./panorama-view";

// Panorama da frota — o retrato CONSOLIDADO dos carros para diretoria e
// gerência: o que a frota É e em que estado está, não quanto custou.
//
// Divisão de trabalho com as telas vizinhas, de propósito:
//   • Painel   → custo e prazos (dinheiro que sai, multa a indicar, CNH vencendo);
//   • Análise  → custo por veículo e por condutor (quem gasta);
//   • Panorama → composição e saúde do cadastro (quantos, de que tipo, onde, que
//                idade, quanto falta regularizar).
// Nada aqui tem botão: para agir sobre uma pendência, desce-se à Central.
//
// Universo = frota EM CIRCULAÇÃO (ATIVO + EM_MANUTENCAO), o mesmo corte que a
// Central e a Análise usam para "veículo em circulação". Vendido e baixado
// entram só na contagem total, nunca na composição.
const EM_CIRCULACAO = ["ATIVO", "EM_MANUTENCAO"] as const;

// Agrupa uma contagem por chave e devolve ordenado do maior para o menor, já no
// formato do gráfico. `topN` corta a cauda numa fatia "Outras" para o gráfico
// não virar uma lista de trinta cidades com um veículo cada.
//
// Campo de texto livre consolida SEM diferenciar caixa nem espaço: "Guarabira",
// "GUARABIRA" e "guarabira " são a mesma cidade, e num painel que existe para
// CONSOLIDAR elas não podem virar três barras. O rótulo exibido é a grafia
// original mais frequente do grupo (não invento capitalização "certa" de um
// campo livre — mostro a que mais aparece). Acento não é normalizado de
// propósito: em nome próprio ele distingue ("São" ≠ "Sao"), e juntar erraria.
function contarPorTexto(
  itens: string[],
  opcoes?: { topN?: number; rotuloOutras?: string },
): Fatia[] {
  const grupos = new Map<string, { total: number; grafias: Map<string, number> }>();
  for (const bruto of itens) {
    const chave = bruto.trim().toLowerCase().replace(/\s+/g, " ");
    let g = grupos.get(chave);
    if (!g) {
      g = { total: 0, grafias: new Map() };
      grupos.set(chave, g);
    }
    g.total++;
    g.grafias.set(bruto, (g.grafias.get(bruto) ?? 0) + 1);
  }
  const canonico = (g: { grafias: Map<string, number> }) =>
    [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const ordenado = [...grupos.values()]
    .map((g) => ({ rotulo: canonico(g), valor: g.total }))
    .sort((a, b) => b.valor - a.valor);
  const topN = opcoes?.topN;
  if (!topN || ordenado.length <= topN) return ordenado;
  const cabeca = ordenado.slice(0, topN);
  const cauda = ordenado.slice(topN).reduce((soma, f) => soma + f.valor, 0);
  if (cauda > 0) cabeca.push({ rotulo: opcoes?.rotuloOutras ?? "Outras", valor: cauda });
  return cabeca;
}

// Fatias numa ORDEM fixa (motorização, propriedade), pulando o que tem zero —
// mantém o eixo estável e sem barra vazia.
function contarNaOrdem(
  valores: string[],
  ordem: readonly { value: string; label: string }[],
): Fatia[] {
  const contagem = new Map<string, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return ordem
    .map((o) => ({ rotulo: o.label, valor: contagem.get(o.value) ?? 0 }))
    .filter((f) => f.valor > 0);
}

const FAIXAS_IDADE = [
  { rotulo: "0–3 anos", teste: (i: number) => i <= 3 },
  { rotulo: "4–7 anos", teste: (i: number) => i >= 4 && i <= 7 },
  { rotulo: "8–12 anos", teste: (i: number) => i >= 8 && i <= 12 },
  { rotulo: "13+ anos", teste: (i: number) => i >= 13 },
] as const;

export default async function PanoramaFrotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const hoje = hojeUTC();
  const anoAtual = hoje.getUTCFullYear();
  const base = `/processos/${empresaId}`;

  const [empresa, empresasDoEscopo, porSituacao, veiculos] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    // Veiculo guarda só `empresaId` (sem relação de volta para Empresa), então o
    // nome de cada CNPJ vem daqui e casa por id na tabela "por empresa".
    prisma.empresa.findMany({
      where: { id: { in: escopo } },
      select: { id: true, nome: true, marca: { select: { nome: true } } },
    }),
    // Uma passada só dá a contagem de todas as situações (para o total e o
    // "fora de circulação"), sem trazer linha nenhuma.
    prisma.veiculo.groupBy({
      by: ["situacao"],
      where: { empresaId: { in: escopo } },
      _count: { _all: true },
    }),
    // A frota em circulação, com só os campos de composição e de cadastro.
    prisma.veiculo.findMany({
      where: { empresaId: { in: escopo }, situacao: { in: [...EM_CIRCULACAO] } },
      select: {
        situacao: true,
        categoria: true,
        motorizacao: true,
        propriedade: true,
        cidadeBase: true,
        setor: true,
        anoFab: true,
        emplacado: true,
        renavam: true,
        chassi: true,
        marca: true,
        modelo: true,
        ufEmplacamento: true,
        empresaId: true,
      },
    }),
  ]);
  if (!empresa) notFound();

  const dadosEmpresa = new Map(
    empresasDoEscopo.map((e) => [e.id, { nome: e.nome, marca: e.marca.nome }]),
  );

  const contagemPorSituacao = new Map(porSituacao.map((s) => [s.situacao, s._count._all]));
  const totalCadastrado = [...contagemPorSituacao.values()].reduce((a, v) => a + v, 0);
  const foraDeCirculacao =
    (contagemPorSituacao.get("VENDIDO") ?? 0) + (contagemPorSituacao.get("BAIXADO") ?? 0);
  const emCirculacao = veiculos.length;
  const emManutencao = veiculos.filter((v) => v.situacao === "EM_MANUTENCAO").length;

  // ── Saúde do cadastro ──────────────────────────────────────────────────────
  let incompletos = 0;
  let naoEmplacados = 0;
  const faltaPorCampo = new Map<string, number>();
  for (const v of veiculos) {
    if (!v.emplacado) naoEmplacados++;
    const falta = camposFaltandoNoVeiculo(v);
    if (falta.length > 0) incompletos++;
    for (const campo of falta) faltaPorCampo.set(campo, (faltaPorCampo.get(campo) ?? 0) + 1);
  }
  const camposFaltando = [...faltaPorCampo.entries()]
    .map(([campo, qtd]) => ({ campo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  // ── Idade média + faixas ───────────────────────────────────────────────────
  const idades = veiculos
    .map((v) => (v.anoFab ? anoAtual - v.anoFab : null))
    .filter((i): i is number => i !== null && i >= 0);
  const idadeMedia = idades.length > 0 ? idades.reduce((a, v) => a + v, 0) / idades.length : null;
  const semAno = veiculos.length - idades.length;
  const porIdade: Fatia[] = FAIXAS_IDADE.map((f) => ({
    rotulo: f.rotulo,
    valor: idades.filter((i) => f.teste(i)).length,
  })).filter((f) => f.valor > 0);
  if (semAno > 0) porIdade.push({ rotulo: "Sem ano", valor: semAno });

  // ── Composição ─────────────────────────────────────────────────────────────
  const porCategoria = contarPorTexto(
    veiculos.map((v) => v.categoria?.trim() || "Não informado"),
    { topN: 8, rotuloOutras: "Outras categorias" },
  );
  const porMotorizacao = contarNaOrdem(veiculos.map((v) => v.motorizacao), MOTORIZACAO_VEICULO);
  const porPropriedade = contarNaOrdem(veiculos.map((v) => v.propriedade), PROPRIEDADE_VEICULO);
  const porCidade = contarPorTexto(
    veiculos.map((v) => v.cidadeBase?.trim() || "Sem cidade-base"),
    { topN: 10, rotuloOutras: "Outras cidades" },
  );
  const porSetor = contarPorTexto(
    veiculos.map((v) => v.setor?.trim() || "Sem setor"),
    { topN: 10, rotuloOutras: "Outros setores" },
  );

  // ── Por empresa (CNPJ) ─────────────────────────────────────────────────────
  // Só vale a pena quando a frota está espalhada em mais de um CNPJ — com um só,
  // a tabela repetiria o KPI. É aqui que a frota importada sob a empresa
  // provisória "A definir" aparece sozinha, sem precisar de caso especial.
  type LinhaEmpresa = {
    id: string;
    nome: string;
    marca: string;
    total: number;
    incompletos: number;
    naoEmplacados: number;
  };
  const porEmpresa = new Map<string, LinhaEmpresa>();
  for (const v of veiculos) {
    let linha = porEmpresa.get(v.empresaId);
    if (!linha) {
      const dados = dadosEmpresa.get(v.empresaId);
      linha = {
        id: v.empresaId,
        nome: dados?.nome ?? "—",
        marca: dados?.marca ?? "—",
        total: 0,
        incompletos: 0,
        naoEmplacados: 0,
      };
      porEmpresa.set(v.empresaId, linha);
    }
    linha.total++;
    if (camposFaltandoNoVeiculo(v).length > 0) linha.incompletos++;
    if (!v.emplacado) linha.naoEmplacados++;
  }
  const linhasEmpresa = [...porEmpresa.values()].sort((a, b) => b.total - a.total);
  const multiEmpresa = linhasEmpresa.length > 1;

  const atalhos = [
    { href: `${base}/frota`, icone: Car, rotulo: "Veículos" },
    { href: base, icone: AlertTriangle, rotulo: "Central de Pendências" },
    { href: `${base}/painel`, icone: LayoutDashboard, rotulo: "Painel (custos)" },
    { href: `${base}/frota/analise`, icone: BarChart3, rotulo: "Análise da frota" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Panorama da frota</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O retrato consolidado dos veículos em circulação: quantos, de que tipo, onde ficam, que
          idade têm e quanto falta regularizar. Custos e prazos ficam no Painel e na Central.
        </p>
      </div>

      {emCirculacao === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum veículo em circulação no escopo selecionado.
            {foraDeCirculacao > 0 && ` Há ${foraDeCirculacao} vendido(s) ou baixado(s).`} O panorama
            nasce assim que o primeiro veículo for cadastrado.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Indicador
              rotulo="Em circulação"
              valor={emCirculacao}
              complemento={`de ${totalCadastrado} cadastrado${totalCadastrado === 1 ? "" : "s"}`}
            />
            <Indicador rotulo="Em manutenção" valor={emManutencao} />
            <Indicador
              rotulo="Idade média"
              valor={idadeMedia !== null ? `${idadeMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos` : "—"}
              complemento={idadeMedia !== null ? `ano médio ~${Math.round(anoAtual - idadeMedia)}` : "sem ano de fabricação"}
            />
            <Indicador
              rotulo="Cadastro incompleto"
              valor={incompletos}
              estado={incompletos > 0 ? "atencao" : "padrao"}
              complemento={`de ${emCirculacao} em circulação`}
            />
            <Indicador
              rotulo="Não emplacados"
              valor={naoEmplacados}
              estado={naoEmplacados > 0 ? "atencao" : "padrao"}
            />
            <Indicador
              rotulo="Fora de circulação"
              valor={foraDeCirculacao}
              complemento="vendidos ou baixados"
            />
          </div>

          {multiEmpresa && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Frota por empresa (CNPJ)</CardTitle>
                <CardDescription>
                  Onde estão os veículos em circulação. Um CNPJ &ldquo;a definir&rdquo; aqui é frota
                  importada esperando ser atribuída à empresa certa.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Em circulação</TableHead>
                      <TableHead className="text-right">Cadastro incompleto</TableHead>
                      <TableHead className="text-right">Não emplacados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasEmpresa.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{l.marca}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.incompletos > 0 ? (
                            <span className="font-semibold text-muted-foreground">{l.incompletos}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.naoEmplacados > 0 ? (
                            <span className="font-semibold text-muted-foreground">{l.naoEmplacados}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoBarras titulo="Idade da frota" descricao="Anos completos desde a fabricação." dados={porIdade} />
            <GraficoBarras titulo="Por categoria" dados={porCategoria} />
            {porMotorizacao.length > 0 && <GraficoBarras titulo="Por motorização" dados={porMotorizacao} />}
            {porPropriedade.length > 0 && <GraficoBarras titulo="Por propriedade" dados={porPropriedade} />}
            <GraficoBarras titulo="Por cidade-base" descricao="Onde o veículo fica lotado." dados={porCidade} />
            <GraficoBarras titulo="Por setor" dados={porSetor} />
          </div>

          {camposFaltando.length > 0 && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">O que falta no cadastro</CardTitle>
                <CardDescription>
                  Campos essenciais em branco na frota em circulação. Cada veículo incompleto vira
                  uma cobrança na Central de Pendências até ser completado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="divide-y divide-border/70">
                  {camposFaltando.map((c) => (
                    <li key={c.campo} className="flex items-center justify-between py-2 text-sm">
                      <span className="capitalize">{c.campo}</span>
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {c.qtd} veículo{c.qtd === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={base}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <AlertTriangle className="size-4 text-muted-foreground" />
                  Ver e cobrar na Central de Pendências
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {atalhos.map((a) => {
              const Icone = a.icone;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Icone className="size-4 text-muted-foreground" />
                  {a.rotulo}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
