import Link from "next/link";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calcularFerias, type PeriodoAquisitivo } from "@/lib/ferias";
import { DIAS_ALERTA_VENCIMENTO, tipoDocumentoLabel } from "@/lib/constants-dp";
import { tipoExameLabel } from "@/lib/constants-sst";
import { tipoEpiLabel } from "@/lib/constants-epi";
import { diferencaEmDiasUTC, formatarData, hojeUTC, somarDiasUTC } from "@/lib/datas";

// Painel de vencimentos: o que está prestes a vencer (ou já venceu) na empresa,
// num lugar só — documentos com validade (ASO, NRs, contratos) e férias no
// limite do período concessivo.
export default async function VencimentosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);

  const [documentos, certificados, exames, epis, colaboradores] = await Promise.all([
    prisma.documentoColaborador.findMany({
      where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      orderBy: { validoAte: "asc" },
      select: {
        id: true,
        tipo: true,
        descricao: true,
        validoAte: true,
        colaboradorId: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    // Sem filtrar validoAte<=limite aqui: um certificado antigo vencido, já
    // renovado por um mais novo, não pode aparecer no painel. O corte pela
    // janela de alerta só é aplicado DEPOIS de achar o mais recente de cada
    // (colaborador, norma) — ver reduzirAoMaisRecente abaixo.
    prisma.certificadoNR.findMany({
      where: { empresaId, validoAte: { not: null }, colaborador: { ativo: true } },
      orderBy: { realizadoEm: "desc" },
      select: {
        id: true,
        norma: true,
        realizadoEm: true,
        validoAte: true,
        colaboradorId: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.exameOcupacional.findMany({
      where: { empresaId, validoAte: { not: null }, tipo: { not: "DEMISSIONAL" }, colaborador: { ativo: true } },
      orderBy: { realizadoEm: "desc" },
      select: {
        id: true,
        tipo: true,
        realizadoEm: true,
        validoAte: true,
        colaboradorId: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    // Mesmo cuidado dos certificados: sem filtrar validoAte<=limite aqui, para
    // uma troca antiga já reposta não aparecer como vencida junto da nova.
    prisma.entregaEPI.findMany({
      where: { empresaId, validoAte: { not: null }, colaborador: { ativo: true } },
      orderBy: { dataEntrega: "desc" },
      select: {
        id: true,
        tipo: true,
        dataEntrega: true,
        validoAte: true,
        colaboradorId: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
      },
    }),
    // Férias precisam do cálculo em memória (os períodos aquisitivos são
    // derivados, não estão no banco), então trazemos só quem é ativo e tem
    // admissão preenchida.
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true, dataAdmissao: { not: null } },
      select: {
        id: true,
        nome: true,
        dataAdmissao: true,
        setor: { select: { nome: true } },
        ferias: {
          where: { status: { in: ["APROVADA", "PENDENTE"] } },
          select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
        },
      },
    }),
  ]);

  // Mantém só o registro mais recente por (colaborador, chave) — orderBy
  // realizadoEm desc + primeira ocorrência resolve isso num Map.
  function reduzirAoMaisRecente<T extends { colaboradorId: string }>(
    itens: T[],
    chave: (item: T) => string,
  ): T[] {
    const vistos = new Set<string>();
    const resultado: T[] = [];
    for (const item of itens) {
      const k = `${item.colaboradorId}::${chave(item)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      resultado.push(item);
    }
    return resultado;
  }

  const certificadosVigentes = reduzirAoMaisRecente(certificados, (c) => c.norma).filter(
    (c) => c.validoAte! <= limite,
  );
  const examesVigentes = reduzirAoMaisRecente(exames, () => "exame")
    .filter((e) => e.validoAte! <= limite)
    .sort((a, b) => a.validoAte!.getTime() - b.validoAte!.getTime());
  certificadosVigentes.sort((a, b) => a.validoAte!.getTime() - b.validoAte!.getTime());

  const episVigentes = reduzirAoMaisRecente(epis, (e) => e.tipo)
    .filter((e) => e.validoAte! <= limite)
    .sort((a, b) => a.validoAte!.getTime() - b.validoAte!.getTime());

  const feriasEmRisco = colaboradores
    .map((c) => {
      const resumo = calcularFerias(c.dataAdmissao!, c.ferias, hoje);
      const critico = resumo.periodos
        .filter((p) => p.status === "VENCIDO" || p.status === "VENCENDO")
        .sort((a, b) => a.diasAteLimite - b.diasAteLimite)[0];
      return critico ? { colaborador: c, periodo: critico } : null;
    })
    .filter((x): x is { colaborador: (typeof colaboradores)[number]; periodo: PeriodoAquisitivo } => x !== null)
    .sort((a, b) => a.periodo.diasAteLimite - b.periodo.diasAteLimite);

  const vencidos = documentos.filter((d) => diferencaEmDiasUTC(d.validoAte!, hoje) < 0).length;
  const nrVencidos = certificadosVigentes.filter((c) => diferencaEmDiasUTC(c.validoAte!, hoje) < 0).length;
  const asoVencidos = examesVigentes.filter((e) => diferencaEmDiasUTC(e.validoAte!, hoje) < 0).length;
  const epiVencidos = episVigentes.filter((e) => diferencaEmDiasUTC(e.validoAte!, hoje) < 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Vencimentos</h2>
        <p className="text-sm text-muted-foreground">
          Tudo que vence nos próximos {DIAS_ALERTA_VENCIMENTO} dias (ou já venceu): documentos, NRs,
          ASO, EPIs e férias no limite legal. Só colaboradores ativos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador label="Documentos vencidos" valor={vencidos} alerta={vencidos > 0} />
        <Indicador label="Documentos a vencer" valor={documentos.length - vencidos} />
        <Indicador label="Treinamentos NR" valor={certificadosVigentes.length} complemento={`${nrVencidos} vencido(s)`} alerta={nrVencidos > 0} />
        <Indicador label="ASO / PCMSO" valor={examesVigentes.length} complemento={`${asoVencidos} vencido(s)`} alerta={asoVencidos > 0} />
        <Indicador label="EPIs para trocar" valor={episVigentes.length} complemento={`${epiVencidos} vencido(s)`} alerta={epiVencidos > 0} />
        <Indicador
          label="Férias vencidas ou vencendo"
          valor={feriasEmRisco.length}
          alerta={feriasEmRisco.some((f) => f.periodo.status === "VENCIDO")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
          <CardDescription>ASO, certificados de NR, contratos e CNH com validade cadastrada.</CardDescription>
        </CardHeader>
        <CardContent>
          {documentos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum documento vencendo nos próximos {DIAS_ALERTA_VENCIMENTO} dias.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentos.map((d) => {
                    const dias = diferencaEmDiasUTC(d.validoAte!, hoje);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link
                            href={`/rh/${empresaId}/colaboradores/${d.colaboradorId}`}
                            className="font-medium hover:underline"
                          >
                            {d.colaborador.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{d.colaborador.setor.nome}</TableCell>
                        <TableCell>
                          {tipoDocumentoLabel(d.tipo)}
                          {d.descricao && (
                            <span className="block text-xs text-muted-foreground">{d.descricao}</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatarData(d.validoAte)}</TableCell>
                        <TableCell>
                          {dias < 0 ? (
                            <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>
                          ) : (
                            <Badge variant="secondary">Vence em {dias} d</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Treinamentos de NR</CardTitle>
          <CardDescription>
            NR-10, NR-35 e demais — o certificado mais recente de cada norma para cada pessoa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {certificadosVigentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum treinamento vencendo nos próximos {DIAS_ALERTA_VENCIMENTO} dias.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Norma</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificadosVigentes.map((c) => {
                    const dias = diferencaEmDiasUTC(c.validoAte!, hoje);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/rh/${empresaId}/colaboradores/${c.colaboradorId}`}
                            className="font-medium hover:underline"
                          >
                            {c.colaborador.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.colaborador.setor.nome}</TableCell>
                        <TableCell className="font-medium">{c.norma}</TableCell>
                        <TableCell className="tabular-nums">{formatarData(c.validoAte)}</TableCell>
                        <TableCell>
                          {dias < 0 ? (
                            <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>
                          ) : (
                            <Badge variant="secondary">Vence em {dias} d</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ASO / PCMSO</CardTitle>
          <CardDescription>O exame ocupacional vigente de cada pessoa (demissional não entra aqui).</CardDescription>
        </CardHeader>
        <CardContent>
          {examesVigentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum ASO vencendo nos próximos {DIAS_ALERTA_VENCIMENTO} dias.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examesVigentes.map((e) => {
                    const dias = diferencaEmDiasUTC(e.validoAte!, hoje);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Link
                            href={`/rh/${empresaId}/colaboradores/${e.colaboradorId}`}
                            className="font-medium hover:underline"
                          >
                            {e.colaborador.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.colaborador.setor.nome}</TableCell>
                        <TableCell>{tipoExameLabel(e.tipo)}</TableCell>
                        <TableCell className="tabular-nums">{formatarData(e.validoAte)}</TableCell>
                        <TableCell>
                          {dias < 0 ? (
                            <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>
                          ) : (
                            <Badge variant="secondary">Vence em {dias} d</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EPIs para trocar</CardTitle>
          <CardDescription>A troca periódica mais recente de cada tipo de EPI, por colaborador.</CardDescription>
        </CardHeader>
        <CardContent>
          {episVigentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum EPI vencendo nos próximos {DIAS_ALERTA_VENCIMENTO} dias.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>EPI</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episVigentes.map((e) => {
                    const dias = diferencaEmDiasUTC(e.validoAte!, hoje);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Link
                            href={`/rh/${empresaId}/colaboradores/${e.colaboradorId}`}
                            className="font-medium hover:underline"
                          >
                            {e.colaborador.nome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.colaborador.setor.nome}</TableCell>
                        <TableCell className="font-medium">{tipoEpiLabel(e.tipo)}</TableCell>
                        <TableCell className="tabular-nums">{formatarData(e.validoAte)}</TableCell>
                        <TableCell>
                          {dias < 0 ? (
                            <Badge variant="destructive">Vencido há {Math.abs(dias)} d</Badge>
                          ) : (
                            <Badge variant="secondary">Vence em {dias} d</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Férias no limite</CardTitle>
          <CardDescription>
            Períodos aquisitivos com saldo cujo prazo de gozo acaba em até 90 dias — passando disso, o
            pagamento é em dobro (CLT art. 137).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feriasEmRisco.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum período de férias no limite.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Período aquisitivo</TableHead>
                    <TableHead>Gozar até</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feriasEmRisco.map(({ colaborador, periodo }) => (
                    <TableRow key={colaborador.id}>
                      <TableCell>
                        <Link
                          href={`/rh/${empresaId}/colaboradores/${colaborador.id}`}
                          className="font-medium hover:underline"
                        >
                          {colaborador.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{colaborador.setor.nome}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatarData(periodo.inicio)} — {formatarData(periodo.fim)}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatarData(periodo.limiteConcessivo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{periodo.saldo}</TableCell>
                      <TableCell>
                        {periodo.status === "VENCIDO" ? (
                          <Badge variant="destructive">
                            Vencido há {Math.abs(periodo.diasAteLimite)} d
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Vence em {periodo.diasAteLimite} d</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({
  label,
  valor,
  complemento,
  alerta,
}: {
  label: string;
  valor: number;
  complemento?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>
        {valor}
      </div>
      {complemento && <div className="text-xs text-muted-foreground">{complemento}</div>}
    </div>
  );
}
