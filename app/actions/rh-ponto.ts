"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";
import { formatarData } from "@/lib/datas";
import { gerarConteudoAFD, gerarConteudoAEJ } from "@/lib/ponto-afdaej";

/**
 * O union de TypeScript some na compilação: `decisao` e `tipo` chegam do
 * cliente como string qualquer numa chamada direta à action. Sem estes
 * conjuntos, um POST com `decisao: "HOMOLOGADO"` gravaria isso na coluna
 * `status` — a linha nunca mais poderia ser decidida (não é PENDENTE) e não
 * casaria com nenhum ramo da tela, aparecendo sem coluna de decisão. Mesmo
 * padrão de TIPOS_VALIDOS em lib/actions/rh-ausencias.ts.
 */
const TIPOS_TRATAMENTO_VALIDOS = new Set([
  "INCLUSAO_MANUAL",
  "ABONO_ATESTADO",
  "JUSTIFICATIVA",
  "CORRECAO",
]);
const DECISOES_VALIDAS = new Set(["APROVADO", "REJEITADO"]);

/**
 * NSRs repetidos na empresa — defeito herdado, conferido na hora de exportar.
 *
 * POR QUE AQUI. Até 13/08/2026 o NSR era calculado como "maior da empresa + 1"
 * sem restrição no banco, e duas batidas simultâneas gravavam com o mesmo
 * número. A migração 20260813180000 fechou a porta para as batidas novas, mas
 * de propósito NÃO renumerou as antigas: o NSR entra no hash SHA-256 de cada
 * linha, e reescrevê-lo em massa invalidaria a integridade de registros de
 * jornada já gravados — decisão de quem responde pelo RH, com o caso à vista.
 *
 * A exportação é onde a repetição faz dano de verdade: o NSR identifica a
 * linha no AFD entregue à fiscalização, e número repetido é arquivo
 * malformado. Avisar aqui alcança quem pode agir, no momento em que importa —
 * um script de linha de comando não alcança ninguém neste time.
 *
 * Avisa, não bloqueia: segurar o arquivo deixaria o RH sem entregar nada, o
 * que é pior do que entregar com um defeito conhecido e datado.
 */
async function nsrsRepetidos(empresaId: string): Promise<bigint[]> {
  const linhas = await prisma.$queryRaw<{ nsr: bigint }[]>`
    SELECT "nsr" FROM "rh"."RegistroPonto"
    WHERE "empresaId" = ${empresaId}
    GROUP BY "nsr" HAVING COUNT(*) > 1
    ORDER BY "nsr" ASC
  `;
  return linhas.map((l) => l.nsr);
}

/** Frase pronta para a tela, ou null quando não há repetição. */
function avisoDeNsrRepetido(repetidos: bigint[]): string | null {
  if (repetidos.length === 0) return null;
  const lista = repetidos.slice(0, 5).map(String).join(", ");
  const resto = repetidos.length > 5 ? ` e mais ${repetidos.length - 5}` : "";
  return (
    `Atenção: ${repetidos.length} número(s) de registro (NSR) aparecem repetidos nesta empresa — ${lista}${resto}. ` +
    "São batidas gravadas antes da correção de 13/08/2026, quando marcações simultâneas podiam receber o mesmo número. " +
    "O arquivo foi gerado assim mesmo, mas o NSR repetido pode ser questionado numa fiscalização. " +
    "Procure a TI antes de entregar: renumerar altera registro de jornada e precisa da sua decisão."
  );
}

export async function exportarArquivoAFDRH(empresaId: string) {
  await requireEmpresaAccess(empresaId);
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, cnpj: true },
  });

  if (!empresa) return { erro: "Empresa não localizada." };

  const registros = await prisma.registroPonto.findMany({
    where: { empresaId },
    orderBy: { nsr: "asc" },
    include: {
      colaborador: { select: { cpf: true } },
    },
  });

  const registrosFormatados = registros.map((r: { nsr: bigint; tipo: string; dataHora: Date; colaborador: { cpf: string | null }; hashSHA256: string }) => ({
    nsr: r.nsr,
    tipo: r.tipo,
    dataHora: r.dataHora,
    cpfColaborador: r.colaborador.cpf || "00000000000",
    hashSHA256: r.hashSHA256,
  }));

  const conteudoAFD = gerarConteudoAFD(
    { razaoSocial: empresa.nome, cnpj: empresa.cnpj || "00000000000000" },
    registrosFormatados
  );

  return {
    sucesso: true,
    conteudoAFD,
    nomeArquivo: `AFD_${empresa.cnpj || empresaId}.txt`,
    aviso: avisoDeNsrRepetido(await nsrsRepetidos(empresaId)),
  };
}

export async function exportarArquivoAEJRH(empresaId: string) {
  await requireEmpresaAccess(empresaId);
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nome: true, cnpj: true },
  });

  if (!empresa) return { erro: "Empresa não localizada." };

  const registros = await prisma.registroPonto.findMany({
    where: { empresaId },
    orderBy: { nsr: "asc" },
    include: {
      colaborador: { select: { cpf: true } },
    },
  });

  const registrosFormatados = registros.map((r: { nsr: bigint; tipo: string; dataHora: Date; colaborador: { cpf: string | null }; hashSHA256: string }) => ({
    nsr: r.nsr,
    tipo: r.tipo,
    dataHora: r.dataHora,
    cpfColaborador: r.colaborador.cpf || "00000000000",
    hashSHA256: r.hashSHA256,
  }));

  const conteudoAEJ = gerarConteudoAEJ(
    { razaoSocial: empresa.nome, cnpj: empresa.cnpj || "00000000000000" },
    registrosFormatados
  );

  return {
    sucesso: true,
    conteudoAEJ,
    nomeArquivo: `AEJ_${empresa.cnpj || empresaId}.txt`,
    aviso: avisoDeNsrRepetido(await nsrsRepetidos(empresaId)),
  };
}

export type CriarJornadaInput = {
  empresaId: string;
  nome: string;
  entrada1: string;
  saida1: string;
  entrada2?: string;
  saida2?: string;
  cargaDiariaMin?: number;
  toleranciaMin?: number;
  sabadoUtil?: boolean;
  domingoUtil?: boolean;
};

export async function criarJornadaTrabalho(input: CriarJornadaInput) {
  await requireEmpresaAccess(input.empresaId);
  if (!input.nome || !input.entrada1 || !input.saida1) {
    return { erro: "Preencha todos os campos obrigatórios da jornada." };
  }

  const jornada = await prisma.jornadaTrabalho.create({
    data: {
      empresaId: input.empresaId,
      nome: input.nome,
      entrada1: input.entrada1,
      saida1: input.saida1,
      entrada2: input.entrada2 || null,
      saida2: input.saida2 || null,
      cargaDiariaMin: input.cargaDiariaMin || 480,
      toleranciaMin: input.toleranciaMin || 10,
      sabadoUtil: input.sabadoUtil || false,
      domingoUtil: input.domingoUtil || false,
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, jornada };
}

export type CriarTratamentoInput = {
  empresaId: string;
  colaboradorId: string;
  registroPontoId?: string;
  dataFato: Date;
  tipo: "INCLUSAO_MANUAL" | "ABONO_ATESTADO" | "JUSTIFICATIVA" | "CORRECAO";
  motivo: string;
};

/**
 * Abre um tratamento de ponto (PTRP) — sempre PENDENTE, nunca já aprovado.
 *
 * Até 11/08/2026 esta função gravava `status: "APROVADO"` junto com
 * `aprovadoPorId: "rh-admin"` e `aprovadoPorNome: "Gestor de RH"` — strings
 * fixas vindas da tela, não da sessão. Ou seja: a trilha de auditoria de um
 * módulo que existe POR EXIGÊNCIA LEGAL (Portaria MTP 671/2021) registrava um
 * aprovador que não era ninguém, e a própria tela dizia "assinado digitalmente
 * pelo RH". Assinatura de quem?
 *
 * Agora o registro nasce pendente e sem aprovador, e quem decide é
 * `decidirTratamentoPonto` — que lê a identidade da SESSÃO. Isso também separa
 * as duas mãos: quem pede o ajuste não é, pelo mero ato de pedir, quem o
 * aprova.
 */
export async function registrarTratamentoPonto(input: CriarTratamentoInput) {
  await requireEmpresaAccess(input.empresaId);

  if (!input.motivo || input.motivo.trim().length < 5) {
    return { erro: "O motivo do tratamento é obrigatório e deve ter no mínimo 5 caracteres." };
  }
  if (!TIPOS_TRATAMENTO_VALIDOS.has(input.tipo)) {
    return { erro: "Tipo de tratamento inválido." };
  }
  // `dataFato` é coluna obrigatória: sem esta checagem um valor ausente (ex.:
  // data que não passou pelo parser do formulário) só falharia lá no Prisma, e
  // a tela reportaria erro de infraestrutura no lugar de erro de preenchimento.
  if (!(input.dataFato instanceof Date) || Number.isNaN(input.dataFato.getTime())) {
    return { erro: "Informe a data da ocorrência." };
  }

  // O colaborador tem que ser DESTA empresa: o id vem do cliente, e sem esta
  // conferência um id de outra empresa abriria tratamento no ponto alheio.
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: input.colaboradorId, empresaId: input.empresaId },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { erro: "Colaborador não encontrado nesta empresa." };

  // Mesma razão do colaborador, um campo adiante: o id da batida também vem do
  // cliente. Sem conferir, a FK cruzaria a fronteira entre empresas e qualquer
  // tela que um dia carregue `registroPonto` junto vazaria a batida alheia.
  if (input.registroPontoId) {
    const batida = await prisma.registroPonto.findFirst({
      where: { id: input.registroPontoId, empresaId: input.empresaId },
      select: { id: true },
    });
    if (!batida) return { erro: "Registro de ponto não encontrado nesta empresa." };
  }

  const tratamento = await prisma.tratamentoPonto.create({
    data: {
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      registroPontoId: input.registroPontoId || null,
      dataFato: input.dataFato,
      tipo: input.tipo,
      motivo: input.motivo.trim(),
      status: "PENDENTE",
    },
  });

  // É AQUI que fica registrado quem pediu o ajuste. A entrega anterior deu
  // isso como "pendente de migration" — errado: a trilha do AuditLog guarda o
  // autor sem tocar no schema, e é o que rh-ausencias.ts já faz para Ausência.
  // Sem isto, a fiscalização veria quem aprovou e nunca quem solicitou.
  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "CRIAR",
    entidade: "TratamentoPonto",
    entidadeId: tratamento.id,
    resumo: `Tratamento de ponto (${input.tipo}) aberto para ${colaborador.nome} em ${formatarData(input.dataFato)}.`,
    detalhes: { tipo: input.tipo, status: "PENDENTE" },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, tratamento };
}

/**
 * Aprova ou rejeita um tratamento pendente, registrando QUEM decidiu.
 *
 * A identidade vem da sessão (`requireEmpresaAccess`), nunca do cliente — é o
 * que faz `aprovadoPorNome` valer alguma coisa numa auditoria. Rejeitar exige
 * motivo pelo mesmo motivo que abrir exige: "rejeitado" sem porquê não se
 * defende numa fiscalização nem se explica ao colaborador.
 */
export async function decidirTratamentoPonto(input: {
  empresaId: string;
  tratamentoId: string;
  decisao: "APROVADO" | "REJEITADO";
  motivoDecisao?: string;
}): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(input.empresaId);

  if (!DECISOES_VALIDAS.has(input.decisao)) return { ok: false, error: "Decisão inválida." };

  const atual = await prisma.tratamentoPonto.findFirst({
    where: { id: input.tratamentoId, empresaId: input.empresaId },
    select: { id: true, status: true, motivo: true, colaborador: { select: { nome: true } } },
  });
  if (!atual) return { ok: false, error: "Tratamento não encontrado nesta empresa." };
  if (atual.status !== "PENDENTE") {
    return { ok: false, error: `Este tratamento já foi ${atual.status.toLowerCase()}.` };
  }
  if (input.decisao === "REJEITADO" && (input.motivoDecisao ?? "").trim().length < 5) {
    return { ok: false, error: "Escreva o motivo da rejeição (mínimo 5 caracteres)." };
  }

  // updateMany com `status: "PENDENTE"` no WHERE, não update por id: entre o
  // findFirst acima e a escrita existe uma janela em que OUTRA pessoa decide o
  // mesmo tratamento. Com update por id, as duas passariam pela checagem e a
  // última escreveria por cima — apagando do banco o motivo da rejeição da
  // primeira e registrando como aprovado o que alguém rejeitou. O WHERE faz o
  // próprio banco arbitrar: só a primeira encontra a linha pendente.
  //
  // `motivo` NÃO entra no `data`: é o texto de quem pediu o ajuste, e quem
  // julga não reescreve o pedido. A justificativa da decisão vai em
  // `motivoDecisao`, coluna própria desde 11/08/2026 — antes era concatenada
  // dentro de `motivo`, o que adulterava o registro original a cada rejeição.
  const { count } = await prisma.tratamentoPonto.updateMany({
    where: { id: atual.id, empresaId: input.empresaId, status: "PENDENTE" },
    data: {
      status: input.decisao,
      motivoDecisao: input.decisao === "REJEITADO" ? input.motivoDecisao!.trim() : null,
      aprovadoPorId: usuario?.id ?? null,
      aprovadoPorNome: usuario?.name ?? null,
      aprovadoEm: new Date(),
    },
  });
  if (count === 0) {
    return { ok: false, error: "Alguém decidiu este tratamento antes de você. Recarregue a tela." };
  }

  // A Central de Aprovações monta "Decisões recentes" lendo AuditLog por
  // acao APROVAR/REPROVAR (aprovacoes/page.tsx). Sem registrar aqui, a decisão
  // de um ajuste de ponto — de um módulo fiscalizável — some daquela trilha,
  // enquanto férias e ausências aparecem.
  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: input.decisao === "APROVADO" ? "APROVAR" : "REPROVAR",
    entidade: "TratamentoPonto",
    entidadeId: atual.id,
    resumo: `Tratamento de ponto de ${atual.colaborador.nome} ${input.decisao === "APROVADO" ? "aprovado" : "rejeitado"} por ${usuario?.name ?? "RH"}.`,
    detalhes: { decisao: input.decisao },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}

// Havia aqui duas funções sem nenhum chamador — `listarJornadasEmpresa` e
// `listarTratamentosPendentesRH`. Num arquivo "use server" isso não é código
// morto inofensivo: TODA função exportada vira endpoint POST acessível pelo
// navegador. Endpoint que ninguém usa é superfície de ataque que ninguém
// revisa. As duas telas que precisam desses dados os buscam direto no
// ponto/page.tsx, no mesmo Promise.all das outras consultas.
