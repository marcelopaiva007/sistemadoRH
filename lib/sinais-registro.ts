// Central de Sinais — o lado com banco: aplica a decisão de lib/sinais.ts e
// coleta os candidatos que não vêm de lib/alertas.ts (o radar de desvio).
//
// Chamado 1×/dia pelo cron alertas-rh, na mesma passada que envia os e-mails.
// `cliente` aceita `tx` de transação — o mesmo padrão de rollback testável de
// lib/alertas.ts (scripts/smoke-*.ts), sem gravar nada de verdade no banco.
import { prisma, type Cliente } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { analisarDesligamentos, type VinculoParaAnomalia } from "@/lib/anomalias";
import { decidirRegistro, type CandidatoSinal } from "@/lib/sinais";

/**
 * O radar sempre varre 24 meses — mesma constante e mesmo motivo de
 * `painel/page.tsx::MESES_DO_RADAR`: o baseline come 12, uma série de 12 não
 * avaliaria mês nenhum. Repetida aqui porque aquele arquivo é uma página.
 */
const MESES_DO_RADAR = 24;

export type ResultadoRegistroSinais = {
  avaliados: number;
  criados: number;
  /** Criados já em silêncio (2+ descartes seguidos na unidade) — na aba própria, nunca sem rastro. */
  silenciados: number;
  /** Situação continua de pé: linha existente ganhou confirmadoEm e frase nova. */
  confirmados: number;
  /** Descarte recente respeitado — nada gravado de propósito. */
  respeitados: number;
};

/**
 * Grava/atualiza um `Sinal` por candidato, seguindo `decidirRegistro`.
 *
 * Sequencial, não `Promise.all`: dois candidatos do mesmo tipo na mesma
 * unidade (duas anomalias de meses diferentes numa marca) leem o histórico um
 * do outro — em paralelo, os dois nasceriam sem ver o descarte que o primeiro
 * deveria ter contado. O volume é dezenas de linhas 1×/dia; não há corrida a
 * otimizar.
 */
export async function registrarSinais(
  candidatos: CandidatoSinal[],
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
): Promise<ResultadoRegistroSinais> {
  let criados = 0;
  let silenciados = 0;
  let confirmados = 0;
  let respeitados = 0;

  for (const c of candidatos) {
    const [ultimoDaChave, historicoDaUnidade] = await Promise.all([
      cliente.sinal.findFirst({
        where: { chaveDedupe: c.chaveDedupe },
        orderBy: { detectadoEm: "desc" },
        select: { id: true, status: true, statusEm: true, silenciadoAte: true },
      }),
      // 8 linhas bastam: `descartesSeguidos` só lê a sequência mais recente e
      // qualquer status vivo a interrompe — a história antiga não muda nada.
      cliente.sinal.findMany({
        where: { tipo: c.tipo, nivelUnidade: c.nivelUnidade, unidadeId: c.unidadeId },
        orderBy: { statusEm: "desc" },
        take: 8,
        select: { status: true, statusEm: true },
      }),
    ]);

    const decisao = decidirRegistro(ultimoDaChave, historicoDaUnidade, hoje);

    if (decisao.acao === "nada") {
      respeitados++;
      continue;
    }

    if (decisao.acao === "confirmar") {
      // A frase acompanha o fato (o mês em curso muda de número dia a dia);
      // status, dono, prazo e motivo são do humano e o detector não toca.
      await cliente.sinal.update({
        where: { id: decisao.sinalId },
        data: {
          titulo: c.titulo,
          observado: c.observado,
          esperado: c.esperado,
          recorte: c.recorte,
          confirmadoEm: hoje,
        },
      });
      confirmados++;
      continue;
    }

    await cliente.sinal.create({
      data: {
        tipo: c.tipo,
        nivelUnidade: c.nivelUnidade,
        unidadeId: c.unidadeId,
        unidadeNome: c.unidadeNome,
        empresaId: c.empresaId,
        chaveDedupe: c.chaveDedupe,
        titulo: c.titulo,
        observado: c.observado,
        esperado: c.esperado,
        recorte: c.recorte,
        gravidade: c.gravidade,
        status: decisao.status,
        silenciadoAte: decisao.silenciadoAte,
        detectadoEm: hoje,
        confirmadoEm: hoje,
        statusEm: hoje,
      },
    });
    if (decisao.status === "SILENCIADO") silenciados++;
    else criados++;
  }

  return { avaliados: candidatos.length, criados, silenciados, confirmados, respeitados };
}

/**
 * Candidatos vindos do radar de desvio (lib/anomalias.ts) — o cron não tem
 * usuário logado, então o recorte é o grupo inteiro (todas as empresas
 * ativas); a TELA é que filtra depois por `empresasVisiveis`.
 *
 * Gravidade "critica" por decisão: o radar só dispara com p < 2% E excesso de
 * 4+ saídas — quando ele fala, já passou por dois cortes que os alertas de
 * limiar fixo não têm.
 */
export async function coletarCandidatosDeAnomalias(
  cliente: Cliente = prisma,
  hoje: Date = hojeUTC(),
): Promise<CandidatoSinal[]> {
  const vinculos = await cliente.colaborador.findMany({
    // `select` explícito: só o que a série mensal precisa. Nenhum nome,
    // salário ou documento — o sinal guarda agregado e frase, nunca pessoa.
    select: {
      ativo: true,
      dataDesligamento: true,
      empresa: {
        select: { id: true, nome: true, ativo: true, marca: { select: { id: true, nome: true } } },
      },
    },
  });

  const paraAnalise: VinculoParaAnomalia[] = vinculos
    .filter(v => v.empresa.ativo)
    .map(v => ({
      empresaId: v.empresa.id,
      empresaNome: v.empresa.nome,
      marcaId: v.empresa.marca.id,
      marcaNome: v.empresa.marca.nome,
      ativo: v.ativo,
      dataDesligamento: v.dataDesligamento,
    }));

  const resultado = analisarDesligamentos(paraAnalise, hoje, MESES_DO_RADAR);
  // Os avisos valem para a análise inteira (quem ficou fora do teste), então
  // vão no rodapé de CADA sinal — o cartão é lido sozinho, não em lote.
  const recorte = resultado.avisos.length > 0 ? resultado.avisos.join(" ") : null;

  const candidatos: CandidatoSinal[] = [];
  for (const a of resultado.anomalias) {
    // O detector de hoje só monta grupo/marca/empresa; "setor"/"cargo" existem
    // no tipo da lib para o futuro. Guarda explícita em vez de cast.
    if (a.nivel !== "grupo" && a.nivel !== "marca" && a.nivel !== "empresa") continue;
    candidatos.push({
      tipo: "ANOMALIA_DESLIGAMENTO",
      // Mesma chave do radar na tela (`nivel:unidadeId:mes`) — evento datado:
      // junho/2026 e julho/2026 na mesma unidade são ocorrências distintas.
      chaveDedupe: `anomalia:${a.nivel}:${a.unidadeId}:${a.mes}`,
      nivelUnidade: a.nivel,
      unidadeId: a.unidadeId,
      unidadeNome: a.unidadeNome,
      empresaId: a.nivel === "empresa" ? a.unidadeId : null,
      titulo: a.frase,
      observado: `${a.observado} desligamentos em ${a.mesRotulo}`,
      esperado:
        a.esperado > 0
          ? `~${a.esperado.toFixed(1).replace(".", ",")} pela média dos ${a.mesesDeBaseline} meses anteriores`
          : `nenhum nos ${a.mesesDeBaseline} meses anteriores`,
      recorte,
      gravidade: "critica",
    });
  }
  return candidatos;
}
