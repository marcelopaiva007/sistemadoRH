"use server";

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";
import { formatarData } from "@/lib/datas";
import { gerarConteudoAFD, gerarConteudoAEJ } from "@/lib/ponto-afdaej";
import { marcacoesDaJornada } from "@/lib/ponto-jornada";
import { TIPOS_TRATAMENTO_VALIDOS, TIPOS_MARCACAO_VALIDOS, tipoMarcacaoLabel } from "@/lib/constants-ponto";
// Hash PRÓPRIO da marcação tratada (cadeia "TRATADA|..."), não o da batida: a
// marcação incluída por decisão do RH nunca se confunde com uma coleta do REP-P.
import { gerarHashMarcacaoTratadaSHA256 } from "@/lib/ponto-seguranca";
// A receita de data/hora (dia de `dataFato` lido em UTC + "HH:mm" de Brasília)
// mora em lib/ponto-jornada.ts, junto do leitor único — o backfill usa a mesma.
import { instanteDaMarcacaoTratada } from "@/lib/ponto-jornada";
import {
  MINIMO_ESTAGIO_MIN_DIA,
  TETO_LEGAL_ESTAGIO_MIN_DIA,
  TETO_LEGAL_ESTAGIO_MIN_SEMANA,
} from "@/lib/ponto-regras";

/**
 * O union de TypeScript some na compilação: `decisao` e `tipo` chegam do
 * cliente como string qualquer numa chamada direta à action. Sem estes
 * conjuntos, um POST com `decisao: "HOMOLOGADO"` gravaria isso na coluna
 * `status` — a linha nunca mais poderia ser decidida (não é PENDENTE) e não
 * casaria com nenhum ramo da tela, aparecendo sem coluna de decisão. Mesmo
 * padrão de TIPOS_VALIDOS em lib/actions/rh-ausencias.ts.
 * O conjunto de tipos mudou-se para lib/constants-ponto.ts em 21/08/2026 —
 * é a mesma lista que as duas telas usam para rotular.
 */
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

  // SÓ RegistroPonto, de propósito — e assim fica. O AFD (Arquivo Fonte de
  // Dados, Portaria MTP 671/2021) é a cópia fiel do que o REP-P COLETOU: cada
  // linha é uma batida com NSR próprio, imutável. A marcação incluída pelo RH
  // por tratamento aprovado (rh.MarcacaoTratada) não foi coletada, não tem
  // NSR e não pode entrar aqui: ela é jornada TRATADA e vai para o AEJ (ver
  // exportarArquivoAEJRH), para o monitor e para a apuração. Misturar as duas
  // seria entregar à fiscalização um arquivo-fonte com marcações que o
  // equipamento nunca registrou. gerarConteudoAFD ainda filtra por origem,
  // como segunda trava.
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

  // O AEJ é o arquivo da JORNADA TRATADA (Portaria MTP 671/2021): entra o que
  // o REP-P coletou (RegistroPonto) E o que o RH incluiu por tratamento
  // aprovado (rh.MarcacaoTratada). Até 04/09/2026 lia só RegistroPonto — os
  // pedidos de inclusão manual aprovados em produção não existiam para este
  // arquivo. A leitura é a mesma do monitor e do portal (lib/ponto-jornada.ts),
  // do primeiro instante até agora. A ordem passa a ser por dataHora, não por
  // NSR: a marcação tratada não tem NSR. Ela sai distinguível na linha (ver
  // gerarConteudoAEJ). O AFD continua lendo só RegistroPonto — ver
  // exportarArquivoAFDRH. O CPF vem de um mapa da empresa, porque o leitor
  // único devolve colaboradorId, não a ficha.
  const [marcacoes, colaboradores] = await Promise.all([
    marcacoesDaJornada(prisma, { empresaId, de: new Date(0), ate: new Date() }),
    prisma.colaborador.findMany({ where: { empresaId }, select: { id: true, cpf: true } }),
  ]);
  const cpfPorColaborador = new Map<string, string | null>(
    colaboradores.map((c) => [c.id, c.cpf] as const),
  );

  const registrosFormatados = marcacoes.map((m) => ({
    nsr: m.nsr,
    tipo: m.tipo,
    dataHora: m.dataHora,
    cpfColaborador: cpfPorColaborador.get(m.colaboradorId) || "00000000000",
    hashSHA256: m.hashSHA256,
    origem: m.origem,
    justificativa: m.justificativa,
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

// Prisma (sem strictUndefinedChecks) REMOVE do WHERE campos undefined — e o
// protocolo de server action aceita "$undefined" no payload. Sem esta guarda,
// um POST direto com empresaId undefined faria `findFirst({ id, empresaId })`
// virar busca só por id (alcançando registro de OUTRA empresa para
// ADMIN/DIRETORIA, cuja requireEmpresaAccess não olha o empresaId) e a
// auditoria gravaria empresaId null — fora da trilha da empresa dona.
function idObrigatorio(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

const REGEX_HORARIO_JORNADA = /^([01]\d|2[0-3]):[0-5]\d$/;
// Teto da tolerância = 10 min/dia, o número do Art. 58 § 1º da CLT. A empresa
// pode APERTAR (tolerância menor), nunca afrouxar — mesmo racional do teto de
// estágio em salvarLimiteEstagio.
const TOLERANCIA_CLT_MAX_MIN = 10;

// Confere os campos de uma jornada e devolve os valores prontos para gravar —
// ou a mensagem de recusa. Compartilhada entre criar e editar: as duas
// gravam as mesmas colunas e são endpoints POST públicos ("use server").
//
// De propósito NÃO exige entrada < saída: turno noturno atravessa a
// meia-noite (22:00 às 05:00) e é caso legítimo — o motor calcula a hora
// noturna ficta. O que se valida é formato e coerência do turno 2 (os dois
// horários ou nenhum — meio turno não descreve jornada nenhuma).
function validarCamposJornada(input: Omit<CriarJornadaInput, "empresaId">):
  | { ok: true; dados: {
      nome: string;
      entrada1: string;
      saida1: string;
      entrada2: string | null;
      saida2: string | null;
      cargaDiariaMin: number;
      toleranciaMin: number;
      sabadoUtil: boolean;
      domingoUtil: boolean;
    } }
  | { ok: false; erro: string } {
  const nome = String(input.nome ?? "").trim();
  if (nome.length < 3) return { ok: false, erro: "Dê um nome à jornada (mínimo 3 caracteres)." };
  if (nome.length > 120) return { ok: false, erro: "O nome da jornada pode ter no máximo 120 caracteres." };

  const entrada1 = String(input.entrada1 ?? "").trim();
  const saida1 = String(input.saida1 ?? "").trim();
  if (!REGEX_HORARIO_JORNADA.test(entrada1) || !REGEX_HORARIO_JORNADA.test(saida1)) {
    return { ok: false, erro: "Informe os horários do 1º turno no formato HH:MM (ex.: 08:00)." };
  }

  const entrada2 = String(input.entrada2 ?? "").trim();
  const saida2 = String(input.saida2 ?? "").trim();
  const temTurno2 = entrada2 !== "" || saida2 !== "";
  if (temTurno2 && (entrada2 === "" || saida2 === "")) {
    return { ok: false, erro: "O 2º turno precisa de entrada E saída — ou deixe os dois vazios para jornada de turno único." };
  }
  if (temTurno2 && (!REGEX_HORARIO_JORNADA.test(entrada2) || !REGEX_HORARIO_JORNADA.test(saida2))) {
    return { ok: false, erro: "Informe os horários do 2º turno no formato HH:MM (ex.: 13:00)." };
  }

  const carga = Math.trunc(Number(input.cargaDiariaMin ?? 480));
  if (!Number.isFinite(carga) || carga < 60 || carga > 1440) {
    return { ok: false, erro: "A carga diária deve ficar entre 1 e 24 horas." };
  }

  const tolerancia = Math.trunc(Number(input.toleranciaMin ?? TOLERANCIA_CLT_MAX_MIN));
  if (!Number.isFinite(tolerancia) || tolerancia < 0 || tolerancia > TOLERANCIA_CLT_MAX_MIN) {
    return {
      ok: false,
      erro: `A tolerância deve ficar entre 0 e ${TOLERANCIA_CLT_MAX_MIN} minutos — é o teto do Art. 58 § 1º da CLT. Você pode reduzir, nunca aumentar.`,
    };
  }

  return {
    ok: true,
    dados: {
      nome,
      entrada1,
      saida1,
      entrada2: temTurno2 ? entrada2 : null,
      saida2: temTurno2 ? saida2 : null,
      cargaDiariaMin: carga,
      toleranciaMin: tolerancia,
      sabadoUtil: input.sabadoUtil === true,
      domingoUtil: input.domingoUtil === true,
    },
  };
}

export async function criarJornadaTrabalho(input: CriarJornadaInput) {
  if (!idObrigatorio(input.empresaId)) return { erro: "Empresa não informada." };
  await requireEmpresaAccess(input.empresaId);

  const v = validarCamposJornada(input);
  if (!v.ok) return { erro: v.erro };

  const jornada = await prisma.jornadaTrabalho.create({
    data: { empresaId: input.empresaId, ...v.dados },
  });

  // Criação auditada desde 21/08/2026 (antes nada de jornada era): é o
  // horário CONTRATUAL que a apuração usa — quem criou importa tanto quanto
  // quem alterou.
  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "CRIAR",
    entidade: "JornadaTrabalho",
    entidadeId: jornada.id,
    resumo: `Jornada de trabalho "${v.dados.nome}" criada (${v.dados.entrada1}–${v.dados.saida1}${v.dados.entrada2 ? ` / ${v.dados.entrada2}–${v.dados.saida2}` : ""}).`,
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { sucesso: true, jornada };
}

export type EditarJornadaInput = CriarJornadaInput & { jornadaId: string };

/**
 * Edita uma jornada já cadastrada — horários, carga, tolerância, dias úteis.
 *
 * Editar em vez de excluir-e-recriar preserva o id e o histórico (createdAt,
 * trilha de auditoria) da jornada. A alteração vale DAQUI PARA FRENTE: as
 * batidas já registradas são append-only e não são tocadas por definição.
 *
 * O par (jornadaId, empresaId) é conferido no WHERE porque o id vem do
 * cliente: sem isso, um id de outra empresa editaria a jornada alheia —
 * mesma guarda de registrarTratamentoPonto.
 */
export async function editarJornadaTrabalho(input: EditarJornadaInput): Promise<ActionResult> {
  if (!idObrigatorio(input.empresaId) || !idObrigatorio(input.jornadaId)) {
    return { ok: false, error: "Jornada ou empresa não informada." };
  }
  await requireEmpresaAccess(input.empresaId);

  const v = validarCamposJornada(input);
  if (!v.ok) return { ok: false, error: v.erro };

  const atual = await prisma.jornadaTrabalho.findFirst({
    where: { id: input.jornadaId, empresaId: input.empresaId },
    // O snapshot `antes` da auditoria precisa de TODOS os campos que o
    // `depois` grava — sem sabadoUtil/domingoUtil aqui, uma edição que só
    // mudasse esses flags virava trilha ilegível ("antes" sem o campo).
    select: {
      id: true, nome: true, entrada1: true, saida1: true, entrada2: true, saida2: true,
      cargaDiariaMin: true, toleranciaMin: true, sabadoUtil: true, domingoUtil: true, ativo: true,
    },
  });
  if (!atual) return { ok: false, error: "Jornada não encontrada nesta empresa." };

  await prisma.jornadaTrabalho.update({
    where: { id: atual.id },
    data: v.dados,
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "ATUALIZAR",
    entidade: "JornadaTrabalho",
    entidadeId: atual.id,
    resumo: `Jornada "${atual.nome}" editada: agora "${v.dados.nome}", ${v.dados.entrada1}–${v.dados.saida1}${v.dados.entrada2 ? ` / ${v.dados.entrada2}–${v.dados.saida2}` : ""}, carga ${v.dados.cargaDiariaMin} min, tolerância ${v.dados.toleranciaMin} min.`,
    detalhes: { antes: atual, depois: v.dados },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}

/**
 * Desativa ou reativa uma jornada. Desativar, e não excluir: a jornada é
 * referência de horário contratual — apagar a linha apagaria também o que a
 * auditoria referencia. Inativa some das escolhas futuras mas fica visível
 * (acinzentada) na lista, de onde pode ser reativada.
 */
export async function alternarJornadaAtiva(
  empresaId: string,
  jornadaId: string,
  ativa: boolean,
): Promise<ActionResult> {
  if (!idObrigatorio(empresaId) || !idObrigatorio(jornadaId)) {
    return { ok: false, error: "Jornada ou empresa não informada." };
  }
  await requireEmpresaAccess(empresaId);

  const atual = await prisma.jornadaTrabalho.findFirst({
    where: { id: jornadaId, empresaId },
    select: { id: true, nome: true, ativo: true },
  });
  if (!atual) return { ok: false, error: "Jornada não encontrada nesta empresa." };
  if (atual.ativo === ativa) return { ok: true };

  await prisma.jornadaTrabalho.update({
    where: { id: atual.id },
    data: { ativo: ativa },
  });

  await registrarAuditoria({
    empresaId,
    acao: ativa ? "REATIVAR" : "DESATIVAR",
    entidade: "JornadaTrabalho",
    entidadeId: atual.id,
    resumo: `Jornada "${atual.nome}" ${ativa ? "reativada" : "desativada"}.`,
  });

  revalidatePath(`/rh/${empresaId}/ponto`);
  return { ok: true };
}

export type CriarTratamentoInput = {
  empresaId: string;
  colaboradorId: string;
  registroPontoId?: string;
  dataFato: Date;
  tipo: "INCLUSAO_MANUAL" | "ABONO_ATESTADO" | "JUSTIFICATIVA" | "CORRECAO";
  motivo: string;
  /**
   * Obrigatórios quando `tipo` é INCLUSAO_MANUAL (desde 04/09/2026): qual
   * marcação faltou e a que horas (de Brasília, "HH:mm"). É o que a aprovação
   * transforma em MarcacaoTratada — sem os dois, o pedido não descreve
   * marcação nenhuma e a decisão não teria o que incluir na jornada. Para os
   * outros tipos são ignorados. Mesmo par que o colaborador já informa em
   * solicitarAjustePonto (portal-solicitacoes-ponto.ts).
   */
  tipoMarcacao?: string;
  horaSolicitada?: string;
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

  // Inclusão manual sem dizer QUAL marcação e A QUE HORAS não é inclusão de
  // nada: a aprovação (decidirTratamentoPonto) materializa exatamente esses
  // dois campos numa MarcacaoTratada, e um pedido aberto sem eles ficaria
  // travado na decisão. Validação no servidor porque a action é um POST
  // público — o select da tela não é garantia. Regex idêntico ao do portal
  // (REGEX_HORA em portal-solicitacoes-ponto.ts) e ao das jornadas.
  let tipoMarcacao: string | null = null;
  let horaSolicitada: string | null = null;
  if (input.tipo === "INCLUSAO_MANUAL") {
    const marcacao = String(input.tipoMarcacao ?? "").trim();
    if (!TIPOS_MARCACAO_VALIDOS.has(marcacao)) {
      return { erro: "Escolha qual marcação deveria ter sido registrada (1ª entrada, 1ª saída, 2ª entrada ou 2ª saída)." };
    }
    const hora = String(input.horaSolicitada ?? "").trim();
    if (!REGEX_HORARIO_JORNADA.test(hora)) {
      return { erro: "Informe o horário da marcação no formato HH:MM (ex.: 08:02)." };
    }
    tipoMarcacao = marcacao;
    horaSolicitada = hora;
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
      tipoMarcacao,
      horaSolicitada,
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
    resumo:
      `Tratamento de ponto (${input.tipo}) aberto para ${colaborador.nome} em ${formatarData(input.dataFato)}` +
      (tipoMarcacao && horaSolicitada ? `: ${tipoMarcacaoLabel(tipoMarcacao)} às ${horaSolicitada}.` : "."),
    detalhes: { tipo: input.tipo, status: "PENDENTE", tipoMarcacao, horaSolicitada },
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
    // tipo/tipoMarcacao/horaSolicitada/dataFato/colaboradorId: é daqui que a
    // aprovação de uma INCLUSAO_MANUAL monta a MarcacaoTratada (abaixo).
    select: {
      id: true,
      status: true,
      motivo: true,
      tipo: true,
      tipoMarcacao: true,
      horaSolicitada: true,
      dataFato: true,
      colaboradorId: true,
      empresaId: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!atual) return { ok: false, error: "Tratamento não encontrado nesta empresa." };
  if (atual.status !== "PENDENTE") {
    return { ok: false, error: `Este tratamento já foi ${atual.status.toLowerCase()}.` };
  }
  if (input.decisao === "REJEITADO" && (input.motivoDecisao ?? "").trim().length < 5) {
    return { ok: false, error: "Escreva o motivo da rejeição (mínimo 5 caracteres)." };
  }

  // Aprovar uma INCLUSAO_MANUAL é INCLUIR a marcação na jornada tratada — e
  // não só mudar um status, como era até 04/09/2026 (28 pedidos aprovados em
  // produção que não existiam para o monitor nem para o AEJ). A marcação vai
  // para rh.MarcacaoTratada, NUNCA para RegistroPonto: RegistroPonto é o que o
  // REP-P coletou e a única fonte do AFD (Portaria MTP 671/2021); o que o RH
  // decide é jornada tratada — entra no AEJ, no painel e na apuração, não
  // consome NSR.
  //
  // Pedido antigo aberto pelo RH sem marcação/hora (o formulário não os pedia)
  // NÃO é aprovado em silêncio: aprovar sem ter o que incluir repetiria o
  // defeito. Recusa com o caminho — rejeitar e reabrir dizendo marcação e hora.
  let marcacao: { tipo: string; dataHora: Date; hash: string } | null = null;
  if (input.decisao === "APROVADO" && atual.tipo === "INCLUSAO_MANUAL") {
    const tipoMarcacao = atual.tipoMarcacao;
    const horaSolicitada = atual.horaSolicitada;
    if (!tipoMarcacao || !horaSolicitada || !TIPOS_MARCACAO_VALIDOS.has(tipoMarcacao)) {
      return {
        ok: false,
        error:
          "Este pedido de inclusão manual não diz qual marcação faltou nem o horário — foi aberto antes de o sistema exigir isso. " +
          "Rejeite-o e abra outro informando a marcação (1ª entrada, 1ª saída, 2ª entrada ou 2ª saída) e o horário; " +
          "só assim a aprovação entra na jornada como marcação.",
      };
    }
    // instanteDaMarcacaoTratada LANÇA em hora fora de HH:mm ou data ausente
    // (linha antiga gravada por fora da validação). Aqui isso vira recusa
    // legível, não erro 500 na tela de quem aprova.
    let dataHora: Date;
    try {
      dataHora = instanteDaMarcacaoTratada(atual.dataFato, horaSolicitada);
    } catch {
      return { ok: false, error: "Não foi possível montar a data e hora da marcação a partir deste pedido. Rejeite-o e abra outro." };
    }
    if (Number.isNaN(dataHora.getTime())) {
      return { ok: false, error: "Não foi possível montar a data e hora da marcação a partir deste pedido. Rejeite-o e abra outro." };
    }
    marcacao = {
      tipo: tipoMarcacao,
      dataHora,
      hash: gerarHashMarcacaoTratadaSHA256({
        tratamentoId: atual.id,
        colaboradorId: atual.colaboradorId,
        empresaId: input.empresaId,
        dataHoraISO: dataHora.toISOString(),
        tipo: tipoMarcacao,
        aprovadoPorId: usuario?.id ?? null,
      }),
    };
  }

  // Um só instante para `aprovadoEm` do tratamento e da marcação: são o mesmo
  // ato, e datas diferentes de segundos fariam a auditoria parecer duas decisões.
  const agora = new Date();

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
  //
  // Transação: o status e a marcação nascem juntos ou não nascem. Sem ela, uma
  // queda entre as duas escritas deixaria um tratamento APROVADO sem marcação —
  // exatamente o estado que este PR existe para acabar. Quem perde a corrida
  // (count 0) não cria marcação; e o @unique em MarcacaoTratada.tratamentoId
  // é a segunda trava contra o duplo clique.
  const { count } = await prisma.$transaction(async (tx) => {
    const resultado = await tx.tratamentoPonto.updateMany({
      where: { id: atual.id, empresaId: input.empresaId, status: "PENDENTE" },
      data: {
        status: input.decisao,
        motivoDecisao: input.decisao === "REJEITADO" ? input.motivoDecisao!.trim() : null,
        aprovadoPorId: usuario?.id ?? null,
        aprovadoPorNome: usuario?.name ?? null,
        aprovadoEm: agora,
      },
    });
    if (resultado.count === 0 || !marcacao) return resultado;

    await tx.marcacaoTratada.create({
      data: {
        empresaId: input.empresaId,
        colaboradorId: atual.colaboradorId,
        tratamentoId: atual.id,
        dataHora: marcacao.dataHora,
        tipo: marcacao.tipo,
        // Cópia do motivo NO INSTANTE da decisão: o tratamento pode ser lido
        // depois, mas a marcação carrega a justificativa que a fez existir.
        justificativa: atual.motivo,
        aprovadoPorId: usuario?.id ?? null,
        aprovadoPorNome: usuario?.name ?? null,
        aprovadoEm: agora,
        hashSHA256: marcacao.hash,
        origemRegistro: "DECISAO",
      },
    });
    return resultado;
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
    resumo:
      `Tratamento de ponto de ${atual.colaborador.nome} ${input.decisao === "APROVADO" ? "aprovado" : "rejeitado"} por ${usuario?.name ?? "RH"}` +
      (marcacao ? ` — ${tipoMarcacaoLabel(marcacao.tipo)} de ${formatarData(atual.dataFato)} às ${atual.horaSolicitada} incluída na jornada.` : "."),
    detalhes: {
      decisao: input.decisao,
      ...(marcacao ? { marcacaoTratada: { tipo: marcacao.tipo, dataHora: marcacao.dataHora.toISOString(), hashSHA256: marcacao.hash } } : {}),
    },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}

/**
 * Gera (ou redefine) o PIN de 6 dígitos do app de ponto (/ponto).
 *
 * O PIN em claro só existe no retorno desta chamada — o banco guarda o
 * bcrypt (Colaborador.pontoPinHash), mesmo princípio do link do Telegram em
 * lib/portal-auth.ts. A tela mostra o número uma vez, com aviso de que não
 * aparece de novo; perdeu, gera outro (o anterior morre junto com o hash).
 *
 * `randomInt` do crypto, não Math.random: PIN é credencial, ainda que curta —
 * a proteção real contra força bruta é o rate limit em lib/ponto-pin-auth.ts.
 */
export async function gerarPinPonto(
  empresaId: string,
  colaboradorId: string,
): Promise<{ ok: true; pin: string } | { ok: false; error: string }> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, cpf: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };
  if (!colaborador.cpf) {
    return { ok: false, error: "Cadastre o CPF na ficha antes: o login do ponto é CPF + PIN." };
  }

  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const pontoPinHash = await bcrypt.hash(pin, 10);

  await prisma.colaborador.update({
    where: { id: colaboradorId },
    data: { pontoPinHash },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `PIN do ponto eletrônico gerado/redefinido para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/ponto`);
  return { ok: true, pin };
}

/**
 * Liga/desliga o acesso de UM colaborador ao ponto eletrônico do portal.
 *
 * Toggle direto, sem motivo obrigatório — ao contrário de
 * `toggleColaboradorAtivo` (desligamento), aqui não há efeito colateral em
 * cascata (benefícios, férias, convites): é só a trava que
 * `registrarPontoPortal` (app/actions/portal-ponto.ts) confere a cada
 * batida. Mesmo padrão de `confirmarFotoReferencia` em rh-colaboradores.ts.
 */
export async function alterarPontoLiberado(
  empresaId: string,
  colaboradorId: string,
  liberado: boolean,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, pontoLiberado: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };
  if (colaborador.pontoLiberado === liberado) return { ok: true };

  await prisma.colaborador.update({
    where: { id: colaboradorId },
    data: { pontoLiberado: liberado },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `Ponto eletrônico ${liberado ? "liberado" : "bloqueado"} para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/ponto`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

// Havia aqui duas funções sem nenhum chamador — `listarJornadasEmpresa` e
// `listarTratamentosPendentesRH`. Num arquivo "use server" isso não é código
// morto inofensivo: TODA função exportada vira endpoint POST acessível pelo
// navegador. Endpoint que ninguém usa é superfície de ataque que ninguém
// revisa. As duas telas que precisam desses dados os buscam direto no
// ponto/page.tsx, no mesmo Promise.all das outras consultas.

/**
 * Salva o teto de jornada de estágio da empresa.
 *
 * O TETO LEGAL É VALIDADO AQUI, no servidor, e não só no formulário: este
 * arquivo é `"use server"`, então esta função é um endpoint POST público. Um
 * `<input max="360">` na tela não impede um POST à mão com 480 — e o valor
 * gravado passaria a valer para todo estagiário da empresa.
 *
 * A régua pode APERTAR (política interna mais restritiva é direito da empresa),
 * nunca afrouxar: o limite da Lei 11.788/2008, art. 10, II é 6h/dia e
 * 30h/semana. `limitesDeEstagio` ainda trunca na LEITURA, para o caso de a
 * coluna ser alterada por fora deste caminho.
 */
export async function salvarLimiteEstagio(input: {
  empresaId: string;
  minutosDia: number;
  minutosSemana: number;
}): Promise<ActionResult> {
  await requireEmpresaAccess(input.empresaId);

  const dia = Math.trunc(Number(input.minutosDia));
  const semana = Math.trunc(Number(input.minutosSemana));

  if (!Number.isFinite(dia) || !Number.isFinite(semana)) {
    return { ok: false, error: "Informe os limites em minutos." };
  }
  if (dia < MINIMO_ESTAGIO_MIN_DIA || semana < MINIMO_ESTAGIO_MIN_DIA) {
    return { ok: false, error: "O limite mínimo é de 1 hora." };
  }
  if (dia > TETO_LEGAL_ESTAGIO_MIN_DIA) {
    return {
      ok: false,
      error: `O limite diário não pode passar de ${TETO_LEGAL_ESTAGIO_MIN_DIA / 60}h — é o teto da Lei 11.788/2008 para estágio. Você pode reduzir, nunca aumentar.`,
    };
  }
  if (semana > TETO_LEGAL_ESTAGIO_MIN_SEMANA) {
    return {
      ok: false,
      error: `O limite semanal não pode passar de ${TETO_LEGAL_ESTAGIO_MIN_SEMANA / 60}h — é o teto da Lei 11.788/2008 para estágio. Você pode reduzir, nunca aumentar.`,
    };
  }

  // `upsert` porque a linha de configuração pode não existir: ela nasce quando
  // alguém abre esta tela pela primeira vez, não junto com a empresa.
  //
  // `exigirGps: false` explícito e SÓ no `create`: esta linha nasce aqui por
  // efeito colateral de salvar o limite de estágio, e sem isto ela herdaria o
  // default da coluna. Já custou caro uma vez — com o default `true`, salvar o
  // teto do estagiário ligava a cerca de GPS de uma empresa sem coordenada
  // cadastrada e o portal parava de aceitar a batida de quem negou a
  // localização no celular. No `update` ele NÃO entra: quem edita o limite de
  // estágio não está mexendo na cerca, e sobrescrever ali desligaria a trava
  // de quem a configurou de propósito.
  await prisma.configuracaoPontoEmpresa.upsert({
    where: { empresaId: input.empresaId },
    create: {
      empresaId: input.empresaId,
      estagioMinDia: dia,
      estagioMinSemana: semana,
      exigirGps: false,
    },
    update: { estagioMinDia: dia, estagioMinSemana: semana },
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoPontoEmpresa",
    entidadeId: input.empresaId,
    resumo: `Limite de jornada de estágio ajustado para ${dia / 60}h por dia e ${semana / 60}h por semana.`,
    detalhes: { estagioMinDia: dia, estagioMinSemana: semana },
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}

// IPv4 com octetos conferidos de verdade; IPv6 na forma pragmática (hex e
// dois-pontos). O objetivo não é ser um parser de RFC: é impedir que um typo
// ("192.168.1" ou "meu-ip") entre na lista e bloqueie a empresa inteira.
function ipValidoDeConfiguracao(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) return v4.slice(1).every((octeto) => Number(octeto) <= 255);
  return /^[0-9a-fA-F:]{2,45}$/.test(ip) && ip.includes(":");
}

export type SalvarTravaIpInput = {
  empresaId: string;
  ipsAutorizados: string; // lista separada por vírgula; vazio = sem trava
  exigirIp: boolean;
};

/**
 * Salva a trava de IP do ponto: a lista de IPs públicos autorizados (o IP
 * fixo do link da empresa) e o bloqueio "exigirIp".
 *
 * VALIDADO NO SERVIDOR pela mesma razão das outras duas configurações deste
 * arquivo: endpoint POST público. Um IP mal digitado gravado por chamada
 * direta não casaria com nada e, com a trava ligada, recusaria TODA batida da
 * empresa — inclusive a de quem está na rede certa.
 *
 * Exigir IP sem nenhum IP na lista é a mesma armadilha da cerca de GPS sem
 * coordenada: validarIpPonto devolve `true` para lista vazia, então a trava
 * ficaria ligada sem travar nada — o RH acharia que restringiu e não
 * restringiu. Com a trava ligada, pelo menos um IP é obrigatório.
 */
export async function salvarTravaIpPonto(input: SalvarTravaIpInput): Promise<ActionResult> {
  if (!idObrigatorio(input.empresaId)) return { ok: false, error: "Empresa não informada." };
  await requireEmpresaAccess(input.empresaId);

  const ips = String(input.ipsAutorizados ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip !== "");

  if (ips.length > 20) {
    return { ok: false, error: "No máximo 20 IPs na lista. Para mais que isso, fale com a TI." };
  }
  const invalido = ips.find((ip) => !ipValidoDeConfiguracao(ip));
  if (invalido) {
    return {
      ok: false,
      error: `"${invalido}" não é um IP válido. Use o formato 200.100.50.25 (IPv4) ou o IPv6 completo, separados por vírgula.`,
    };
  }

  const exigirIp = input.exigirIp === true;
  if (exigirIp && ips.length === 0) {
    return {
      ok: false,
      error: "Para bloquear batida fora da rede, cadastre pelo menos um IP autorizado.",
    };
  }

  const dados = {
    ipsAutorizados: ips.length > 0 ? ips.join(", ") : null,
    exigirIp,
  };

  // `exigirGps: false` fica FORA de `dados`, de propósito: no `create` ele
  // impede que a linha nasça com a cerca de GPS ligada sem coordenada nenhuma
  // (ver o mesmo comentário em salvarLimiteEstagio), mas no `update` ele
  // desligaria a cerca de quem a configurou — salvar um IP não pode mexer na
  // trava de GPS.
  await prisma.configuracaoPontoEmpresa.upsert({
    where: { empresaId: input.empresaId },
    create: { empresaId: input.empresaId, ...dados, exigirGps: false },
    update: dados,
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoPontoEmpresa",
    entidadeId: input.empresaId,
    resumo:
      ips.length > 0
        ? `Trava de IP do ponto ${exigirIp ? "ativada (bloqueia fora da rede)" : "cadastrada (sem bloqueio)"}: ${ips.join(", ")}.`
        : "Trava de IP do ponto removida — batidas voltam a valer de qualquer rede.",
    detalhes: dados,
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}

// Régua do raio da cerca de GPS. O piso de 50 m existe porque GPS de celular
// erra dezenas de metros mesmo parado no lugar certo: raio menor que isso
// recusaria batida de quem ESTÁ na empresa. O teto de 10 km cobre pátio
// industrial e obra grande; acima disso a cerca já não cerca nada.
const RAIO_GPS_MINIMO_M = 50;
const RAIO_GPS_MAXIMO_M = 10_000;

export type SalvarGeofencingInput = {
  empresaId: string;
  latitudeEmpresa: number | null;
  longitudeEmpresa: number | null;
  raioPermitidoMtrs: number;
  exigirGps: boolean;
};

/**
 * Salva a cerca de localização do ponto: coordenadas da empresa, raio e a
 * trava "exigir GPS".
 *
 * OS LIMITES SÃO VALIDADOS AQUI, no servidor, pelo mesmo motivo de
 * salvarLimiteEstagio logo acima: arquivo "use server" é endpoint POST
 * público, e uma latitude 999 gravada por chamada direta faria a Haversine
 * devolver distância sem sentido — recusando toda batida da empresa.
 *
 * Latitude e longitude andam JUNTAS (as duas ou nenhuma): meia coordenada não
 * define lugar nenhum, e validarGeofencingGps trata qualquer metade nula como
 * "sem cerca" — a pessoa acharia que configurou e nada estaria valendo.
 * Limpar as duas é o jeito legítimo de DESLIGAR a cerca mantendo o resto.
 */
export async function salvarGeofencingPonto(input: SalvarGeofencingInput): Promise<ActionResult> {
  if (!idObrigatorio(input.empresaId)) return { ok: false, error: "Empresa não informada." };
  await requireEmpresaAccess(input.empresaId);

  const lat = input.latitudeEmpresa;
  const lng = input.longitudeEmpresa;
  const temLat = typeof lat === "number" && Number.isFinite(lat);
  const temLng = typeof lng === "number" && Number.isFinite(lng);

  if (temLat !== temLng) {
    return { ok: false, error: "Latitude e longitude andam juntas: preencha as duas ou deixe as duas vazias." };
  }
  if (temLat && (lat! < -90 || lat! > 90)) {
    return { ok: false, error: "Latitude fora do intervalo válido (-90 a 90)." };
  }
  if (temLng && (lng! < -180 || lng! > 180)) {
    return { ok: false, error: "Longitude fora do intervalo válido (-180 a 180)." };
  }

  const raio = Math.trunc(Number(input.raioPermitidoMtrs));
  if (!Number.isFinite(raio) || raio < RAIO_GPS_MINIMO_M || raio > RAIO_GPS_MAXIMO_M) {
    return {
      ok: false,
      error: `O raio deve ficar entre ${RAIO_GPS_MINIMO_M} m e ${RAIO_GPS_MAXIMO_M / 1000} km. Abaixo de ${RAIO_GPS_MINIMO_M} m, o erro normal do GPS do celular recusaria batida de quem está dentro da empresa.`,
    };
  }

  const exigirGps = input.exigirGps === true;

  // Exigir GPS sem cerca cadastrada obriga a pessoa a ligar a localização mas
  // não valida lugar nenhum — combinação que só engana o RH. Com a trava
  // ligada, a coordenada é obrigatória.
  if (exigirGps && !temLat) {
    return {
      ok: false,
      error: "Para bloquear batida fora do raio, cadastre a localização da empresa (latitude e longitude).",
    };
  }

  const dados = {
    latitudeEmpresa: temLat ? lat : null,
    longitudeEmpresa: temLng ? lng : null,
    raioPermitidoMtrs: raio,
    exigirGps,
  };

  await prisma.configuracaoPontoEmpresa.upsert({
    where: { empresaId: input.empresaId },
    create: { empresaId: input.empresaId, ...dados },
    update: dados,
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoPontoEmpresa",
    entidadeId: input.empresaId,
    resumo: temLat
      ? `Cerca de GPS do ponto ${exigirGps ? "ativada (bloqueia fora do raio)" : "cadastrada (sem bloqueio)"}: raio de ${raio} m em torno de ${lat!.toFixed(6)}, ${lng!.toFixed(6)}.`
      : "Cerca de GPS do ponto removida — batidas voltam a valer de qualquer lugar.",
    detalhes: dados,
  });

  revalidatePath(`/rh/${input.empresaId}/ponto`);
  return { ok: true };
}
