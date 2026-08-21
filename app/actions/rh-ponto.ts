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
import { TIPOS_TRATAMENTO_VALIDOS } from "@/lib/constants-ponto";
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
  await prisma.configuracaoPontoEmpresa.upsert({
    where: { empresaId: input.empresaId },
    create: { empresaId: input.empresaId, estagioMinDia: dia, estagioMinSemana: semana },
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
