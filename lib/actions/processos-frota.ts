"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, dataHoraDoFormularioBrasilia, hojeUTC, somarDiasUTC } from "@/lib/datas";
import {
  normalizarPlaca,
  placaValida,
  formatarPlaca,
  notificacaoFicta,
  prazoIndicacao,
  DIAS_NOVO_CRV,
  DIAS_COMUNICACAO_VENDA,
  PONTOS_POR_NATUREZA,
} from "@/lib/processos/ctb";
import type { ActionResult } from "@/lib/constants";

// Frota do módulo Processos & Ativos.
//
// A regra de acesso NÃO é reimplementada aqui: toda action chama
// `requireProcessosEmpresa`, que por sua vez pergunta a `usuarioAlcancaEmpresa`
// — a mesma função que o RH usa, e que já cobre papel global, vínculo por CNPJ
// e vínculo por marca. Foi reimplementar essa regra à mão que deixou nove rotas
// de API com cinco variantes diferentes em 11/08/2026.
//
// E o escopo de empresa é sempre RECALCULADO no servidor. Action "use server" é
// endpoint público: um POST à mão com o `empresaId` de outro CNPJ tem que
// esbarrar na guarda, nunca no formulário.
//
// REGRA DE ESCOPO DAS ESCRITAS: as telas são CONSOLIDADAS (listam todos os
// CNPJs que a pessoa enxerga), então o alvo de uma ação pode ser de outro CNPJ
// que não o da URL. Toda busca de alvo usa `empresasVisiveis(usuario)` — o que
// a pessoa alcança —, e o `empresaId` GRAVADO vem sempre DO PRÓPRIO ALVO
// (veiculo.empresaId, colaborador.empresaId), nunca da URL. A primeira versão
// destas actions travava tudo no CNPJ do caminho: cada linha de outro CNPJ na
// tela consolidada falhava com "não encontrado no seu acesso" — e a edição de
// veículo ainda REESCREVIA o dono para o CNPJ da URL, mudando o carro de
// empresa em silêncio.

function caminho(empresaId: string) {
  return `/processos/${empresaId}`;
}

/** Cadastra ou edita um veículo. */
export async function salvarVeiculo(input: {
  id?: string | null;
  empresaId: string;
  placa: string;
  renavam?: string | null;
  chassi?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anoFab?: number | null;
  anoModelo?: number | null;
  ufEmplacamento?: string | null;
  municipioEmplacamento?: string | null;
  propriedade?: string | null;
  situacao?: string | null;
  aderidoSne?: boolean;
  dataAdesaoSne?: string | null;
  recallPendente?: boolean;
  hodometroAtual?: number | null;
  observacoes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  // EDITANDO: o alvo tem que estar no alcance do usuário — o `update` por id
  // puro aceitaria o id de um veículo de empresa que ele nem enxerga (IDOR).
  // E o veículo FICA na empresa dele: a tela é consolidada, então editar um
  // carro da empresa B estando na URL da empresa A não pode mudá-lo de dono.
  let existente: { id: string; empresaId: string; aderidoSne: boolean; dataAdesaoSne: Date | null } | null = null;
  if (input.id) {
    const visiveis = await empresasVisiveis(usuario);
    existente = await prisma.veiculo.findFirst({
      where: { id: input.id, empresaId: { in: visiveis } },
      select: { id: true, empresaId: true, aderidoSne: true, dataAdesaoSne: true },
    });
    if (!existente) return { ok: false, error: "Veículo não encontrado no seu acesso." };
  }

  const placa = normalizarPlaca(input.placa);
  if (!placaValida(placa)) {
    return { ok: false, error: "Placa inválida. Use o formato ABC1234 ou ABC1D23." };
  }

  // A adesão ao SNE só vale para o desconto de 40% se for ANTERIOR à
  // notificação — por isso a data é obrigatória quando o "sim" é marcado.
  // Guardar só o booleano deixaria o sistema sem como responder "esta multa
  // pegou desconto?", que é justamente a pergunta que a adesão existe para
  // responder.
  //
  // Na EDIÇÃO, um "sim" sem data reaproveita a data já gravada: sem isso, todo
  // ajuste de modelo num veículo aderido exigiria redigitar uma data que a
  // pessoa não tem à mão — e redigitá-la errado mudaria em silêncio o que
  // decide o desconto.
  const aderidoSne = input.aderidoSne ?? false;
  const dataAdesaoSne =
    dataDoFormulario(input.dataAdesaoSne ?? null) ?? (aderidoSne ? (existente?.dataAdesaoSne ?? null) : null);
  if (aderidoSne && !dataAdesaoSne) {
    return { ok: false, error: "Informe a data da adesão ao SNE — é ela que decide o desconto." };
  }

  // Placa é única no sistema inteiro, não por empresa: o mesmo carro não pode
  // estar em dois CNPJs. Checagem explícita para a mensagem ser legível, em vez
  // de estourar erro de constraint do Postgres na cara do usuário.
  const jaExiste = await prisma.veiculo.findUnique({ where: { placa }, select: { id: true, empresaId: true } });
  if (jaExiste && jaExiste.id !== input.id) {
    return { ok: false, error: `A placa ${formatarPlaca(placa)} já está cadastrada.` };
  }

  const dados = {
    // Criando, o dono é o CNPJ da tela; editando, o carro fica onde está.
    empresaId: existente?.empresaId ?? input.empresaId,
    placa,
    renavam: (input.renavam ?? "").replace(/\D/g, "") || null,
    chassi: (input.chassi ?? "").trim().toUpperCase() || null,
    marca: (input.marca ?? "").trim() || null,
    modelo: (input.modelo ?? "").trim() || null,
    anoFab: input.anoFab ?? null,
    anoModelo: input.anoModelo ?? null,
    ufEmplacamento: (input.ufEmplacamento ?? "").trim().toUpperCase().slice(0, 2) || null,
    municipioEmplacamento: (input.municipioEmplacamento ?? "").trim() || null,
    propriedade: input.propriedade ?? "PROPRIO",
    situacao: input.situacao ?? "ATIVO",
    aderidoSne,
    dataAdesaoSne,
    recallPendente: input.recallPendente ?? false,
    hodometroAtual: input.hodometroAtual ?? null,
    observacoes: (input.observacoes ?? "").trim().slice(0, 1000) || null,
  };

  const veiculo = input.id
    ? await prisma.veiculo.update({ where: { id: input.id }, data: dados })
    : await prisma.veiculo.create({
        data: { ...dados, criadoPorId: usuario.id, criadoPorNome: usuario.name ?? usuario.username },
      });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Veiculo",
    entidadeId: veiculo.id,
    resumo: `${input.id ? "Editou" : "Cadastrou"} o veículo ${formatarPlaca(placa)}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, id: veiculo.id };
}

/** Documento com validade do veículo — é daqui que sai metade dos alertas. */
export async function salvarDocumentoVeiculo(input: {
  id?: string | null;
  empresaId: string;
  veiculoId: string;
  tipo: string;
  exercicio?: number | null;
  dataEmissao?: string | null;
  dataVencimento?: string | null;
  valor?: number | null;
  observacoes?: string | null;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  // O id vem do cliente e a tela é consolidada: o veículo pode ser de OUTRO
  // CNPJ visível — o que não pode é ser de um CNPJ fora do alcance.
  const visiveis = await empresasVisiveis(usuario);
  const veiculo = await prisma.veiculo.findFirst({
    where: { id: input.veiculoId, empresaId: { in: visiveis } },
    select: { id: true, placa: true, empresaId: true },
  });
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  if (!input.tipo) return { ok: false, error: "Escolha o tipo de documento." };
  const dataVencimento = dataDoFormulario(input.dataVencimento ?? null);

  const dados = {
    // Do veículo, não da URL: o documento pertence ao CNPJ do carro.
    empresaId: veiculo.empresaId,
    veiculoId: veiculo.id,
    tipo: input.tipo,
    exercicio: input.exercicio ?? null,
    dataEmissao: dataDoFormulario(input.dataEmissao ?? null),
    dataVencimento,
    valor: input.valor ?? null,
    observacoes: (input.observacoes ?? "").trim().slice(0, 500) || null,
  };

  if (input.id) {
    await prisma.documentoVeiculo.update({ where: { id: input.id }, data: dados });
  } else {
    await prisma.documentoVeiculo.create({
      data: { ...dados, criadoPorId: usuario.id, criadoPorNome: usuario.name ?? usuario.username },
    });
  }

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "DocumentoVeiculo",
    entidadeId: input.id ?? null,
    resumo: `${input.id ? "Editou" : "Registrou"} ${input.tipo} do veículo ${formatarPlaca(veiculo.placa)}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/**
 * Transforma um colaborador em condutor — ou edita os dados de habilitação.
 *
 * A validade da CNH é LIDA do documento, nunca calculada. A regra de anos mudou
 * por faixa etária, e uma projeção erraria a data do alerta — o que é pior que
 * não alertar, porque dá a sensação de estar coberto.
 */
export async function salvarCondutor(input: {
  id?: string | null;
  empresaId: string;
  colaboradorId: string;
  cnhNumero?: string | null;
  cnhCategoria?: string | null;
  cnhUf?: string | null;
  cnhValidade?: string | null;
  possuiEAR?: boolean;
  toxicologicoUltimaData?: string | null;
  toxicologicoValidade?: string | null;
  cursoReciclagemUltimaData?: string | null;
  statusHabilitacao?: string | null;
  condutorExterno?: boolean;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: input.colaboradorId, empresaId: { in: visiveis } },
    select: { id: true, nome: true, empresaId: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado no seu acesso." };

  const dados = {
    // Do colaborador, não da URL: numa tela consolidada, registrar o motorista
    // da empresa B estando na URL da empresa A não pode movê-lo de CNPJ — as
    // multas dele são indicadas pela empresa DELE.
    empresaId: colaborador.empresaId,
    colaboradorId: colaborador.id,
    cnhNumero: (input.cnhNumero ?? "").replace(/\D/g, "") || null,
    cnhCategoria: (input.cnhCategoria ?? "").trim().toUpperCase() || null,
    cnhUf: (input.cnhUf ?? "").trim().toUpperCase().slice(0, 2) || null,
    cnhValidade: dataDoFormulario(input.cnhValidade ?? null),
    possuiEAR: input.possuiEAR ?? false,
    toxicologicoUltimaData: dataDoFormulario(input.toxicologicoUltimaData ?? null),
    toxicologicoValidade: dataDoFormulario(input.toxicologicoValidade ?? null),
    cursoReciclagemUltimaData: dataDoFormulario(input.cursoReciclagemUltimaData ?? null),
    statusHabilitacao: input.statusHabilitacao ?? "APTO",
    condutorExterno: input.condutorExterno ?? false,
  };

  // upsert pelo colaborador: o vínculo é 1:1, e tentar criar duas vezes o mesmo
  // condutor é o caminho natural de quem abre a tela por dois lugares.
  //
  // No UPDATE, campo `undefined` no input NÃO sobrescreve: `undefined` em data
  // do Prisma significa "não mexa". Sem isto, a primeira versão apagava a
  // validade da CNH de quem só corrigia a categoria — e, na sincronização
  // seguinte, a pendência de CNH vencendo era "resolvida" sozinha, sem ninguém
  // ter renovado nada. O CREATE continua com o objeto completo: criar sem os
  // campos é criar com eles vazios mesmo.
  const semApagar = {
    ...dados,
    cnhNumero: input.cnhNumero === undefined ? undefined : dados.cnhNumero,
    cnhCategoria: input.cnhCategoria === undefined ? undefined : dados.cnhCategoria,
    cnhUf: input.cnhUf === undefined ? undefined : dados.cnhUf,
    cnhValidade: input.cnhValidade === undefined ? undefined : dados.cnhValidade,
    toxicologicoUltimaData:
      input.toxicologicoUltimaData === undefined ? undefined : dados.toxicologicoUltimaData,
    toxicologicoValidade:
      input.toxicologicoValidade === undefined ? undefined : dados.toxicologicoValidade,
    cursoReciclagemUltimaData:
      input.cursoReciclagemUltimaData === undefined ? undefined : dados.cursoReciclagemUltimaData,
  };
  await prisma.condutor.upsert({
    where: { colaboradorId: colaborador.id },
    create: dados,
    update: semApagar,
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Condutor",
    entidadeId: colaborador.id,
    resumo: `${input.id ? "Editou" : "Cadastrou"} os dados de condutor de ${colaborador.nome}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/**
 * Entrega o veículo a alguém — e é este registro que, meses depois, responde
 * "quem estava com a placa no dia da infração?".
 *
 * Encerra automaticamente a alocação aberta anterior do MESMO veículo: dois
 * condutores em posse ao mesmo tempo tornaria a resposta ambígua justamente no
 * momento em que ela precisa ser inequívoca — a indicação de condutor é feita
 * sob responsabilidade da empresa.
 */
export async function abrirAlocacao(input: {
  empresaId: string;
  veiculoId: string;
  condutorId: string;
  dataInicio: string;
  tipo?: string | null;
  kmEntrega?: number | null;
  observacoes?: string | null;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const [veiculo, condutor] = await Promise.all([
    prisma.veiculo.findFirst({
      where: { id: input.veiculoId, empresaId: { in: visiveis } },
      select: { id: true, placa: true, empresaId: true },
    }),
    // O condutor pode ser de OUTRO CNPJ do grupo — neste grupo é o normal, não
    // a exceção. O que importa é os dois estarem no alcance de quem registra.
    prisma.condutor.findFirst({
      where: { id: input.condutorId, empresaId: { in: visiveis } },
      select: { id: true, colaborador: { select: { nome: true } } },
    }),
  ]);
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };
  if (!condutor) return { ok: false, error: "Condutor não encontrado no seu acesso." };

  const dataInicio = dataDoFormulario(input.dataInicio);
  if (!dataInicio) return { ok: false, error: "Informe a data de entrega." };

  await prisma.$transaction([
    prisma.alocacaoVeiculo.updateMany({
      where: { veiculoId: veiculo.id, dataFim: null },
      data: { dataFim: dataInicio },
    }),
    prisma.alocacaoVeiculo.create({
      data: {
        // Do veículo: a posse pertence ao CNPJ do carro, que é quem recebe a
        // multa e precisa responder "quem dirigia".
        empresaId: veiculo.empresaId,
        veiculoId: veiculo.id,
        condutorId: condutor.id,
        dataInicio,
        tipo: input.tipo ?? "PERMANENTE",
        kmEntrega: input.kmEntrega ?? null,
        observacoes: (input.observacoes ?? "").trim().slice(0, 500) || null,
        criadoPorId: usuario.id,
        criadoPorNome: usuario.name ?? usuario.username,
      },
    }),
  ]);

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: "VINCULAR",
    entidade: "AlocacaoVeiculo",
    entidadeId: veiculo.id,
    resumo: `Entregou o veículo ${formatarPlaca(veiculo.placa)} a ${condutor.colaborador.nome}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

export async function encerrarAlocacao(input: {
  empresaId: string;
  alocacaoId: string;
  dataFim: string;
  kmDevolucao?: number | null;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const alocacao = await prisma.alocacaoVeiculo.findFirst({
    where: { id: input.alocacaoId, empresaId: { in: visiveis } },
    select: { id: true, dataInicio: true, empresaId: true, veiculo: { select: { placa: true } } },
  });
  if (!alocacao) return { ok: false, error: "Registro não encontrado no seu acesso." };

  const dataFim = dataDoFormulario(input.dataFim);
  if (!dataFim) return { ok: false, error: "Informe a data de devolução." };
  // Devolver antes de entregar deixaria um período negativo — e a consulta de
  // "quem dirigia no dia X" passaria a não achar ninguém, ou a achar dois.
  if (dataFim < alocacao.dataInicio) {
    return { ok: false, error: "A devolução não pode ser anterior à entrega." };
  }

  await prisma.alocacaoVeiculo.update({
    where: { id: alocacao.id },
    data: { dataFim, kmDevolucao: input.kmDevolucao ?? null },
  });

  await registrarAuditoria({
    empresaId: alocacao.empresaId,
    acao: "DESVINCULAR",
    entidade: "AlocacaoVeiculo",
    entidadeId: alocacao.id,
    resumo: `Recebeu de volta o veículo ${formatarPlaca(alocacao.veiculo.placa)}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/**
 * Registra a multa e calcula, de uma vez, todos os relógios que ela dispara.
 *
 * Os prazos são gravados como COLUNA e não recalculados na leitura. O motivo
 * aparece meses depois: a data que vale no SNE é a inclusão + 30 dias (CTB,
 * art. 282-A, §2º), e essa regra já mudou. Gravando, um alerta antigo continua
 * explicando por que disparou quando disparou.
 */
export async function registrarInfracao(input: {
  id?: string | null;
  empresaId: string;
  veiculoId: string;
  numeroAIT: string;
  orgaoAutuador?: string | null;
  dataHoraInfracao: string;
  local?: string | null;
  codigoInfracao?: string | null;
  descricao?: string | null;
  natureza?: string | null;
  geraPontos?: boolean;
  valorOriginal?: number | null;
  dataExpedicaoNA?: string | null;
  recebidaViaSne?: boolean;
  prazoDefesaAutuacao?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const veiculo = await prisma.veiculo.findFirst({
    where: { id: input.veiculoId, empresaId: { in: visiveis } },
    select: { id: true, placa: true, empresaId: true, aderidoSne: true, dataAdesaoSne: true },
  });
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  const numeroAIT = (input.numeroAIT ?? "").trim().toUpperCase();
  if (!numeroAIT) return { ok: false, error: "Informe o número do auto de infração (AIT)." };

  // Horário de BRASÍLIA, não do servidor: `new Date("2026-08-23T14:30")` na
  // Vercel leria 14:30 UTC e a tela mostraria 11:30 — e é esta hora que decide
  // QUEM estava com o veículo na consulta de indicação.
  const dataHoraInfracao = dataHoraDoFormularioBrasilia(input.dataHoraInfracao);
  if (!dataHoraInfracao) {
    return { ok: false, error: "Informe a data e a hora da infração." };
  }

  const duplicada = await prisma.infracao.findFirst({
    where: { numeroAIT, empresaId: veiculo.empresaId, ...(input.id ? { NOT: { id: input.id } } : {}) },
    select: { id: true },
  });
  if (duplicada) return { ok: false, error: `O AIT ${numeroAIT} já está registrado.` };

  const dataExpedicaoNA = dataDoFormulario(input.dataExpedicaoNA ?? null);
  // A ficção do SNE só se aplica se o veículo estava aderido — e o desconto de
  // 40% depende de a adesão ser anterior a esta notificação.
  const viaSne = (input.recebidaViaSne ?? false) && veiculo.aderidoSne;
  const notificacao = dataExpedicaoNA ? notificacaoFicta(dataExpedicaoNA, viaSne) : null;

  // Pontos NÃO derivam da natureza sozinhos: sete dispositivos do CTB são
  // infração sem pontuação (art. 259, §4º, II). Por isso `geraPontos` é uma
  // escolha de quem lança, lida do próprio auto — e a natureza só dá o número
  // quando a resposta é sim.
  const geraPontos = input.geraPontos ?? true;
  const pontos = geraPontos && input.natureza ? (PONTOS_POR_NATUREZA[input.natureza] ?? 0) : 0;

  const dados = {
    // Do veículo: a multa chega no CNPJ do carro, e é ele que indica.
    empresaId: veiculo.empresaId,
    veiculoId: veiculo.id,
    numeroAIT,
    orgaoAutuador: (input.orgaoAutuador ?? "").trim() || null,
    dataHoraInfracao,
    local: (input.local ?? "").trim() || null,
    codigoInfracao: (input.codigoInfracao ?? "").trim() || null,
    descricao: (input.descricao ?? "").trim().slice(0, 500) || null,
    natureza: input.natureza ?? null,
    geraPontos,
    pontos,
    valorOriginal: input.valorOriginal ?? null,
    dataExpedicaoNA,
    dataNotificacaoFicta: notificacao,
    prazoIndicacaoCondutor: notificacao ? prazoIndicacao(notificacao) : null,
    prazoDefesaAutuacao: dataDoFormulario(input.prazoDefesaAutuacao ?? null),
  };

  const infracao = input.id
    ? await prisma.infracao.update({ where: { id: input.id }, data: dados })
    : await prisma.infracao.create({
        data: { ...dados, criadoPorId: usuario.id, criadoPorNome: usuario.name ?? usuario.username },
      });

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Infracao",
    entidadeId: infracao.id,
    resumo: `${input.id ? "Editou" : "Registrou"} a multa ${numeroAIT} do veículo ${formatarPlaca(veiculo.placa)}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, id: infracao.id };
}

/**
 * Quem estava com o veículo naquele instante — a consulta que o módulo inteiro
 * existe para tornar possível.
 *
 * `dataFim: null` cobre quem está com o carro agora; o `gte` cobre quem estava
 * e já devolveu. Sem o histórico, esta pergunta vira uma corrente de WhatsApp e
 * trinta dias passam.
 */
export async function sugerirCondutor(input: {
  empresaId: string;
  veiculoId: string;
  quando: string;
}): Promise<{ ok: true; condutorId: string | null; nome: string | null } | { ok: false; error: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);
  const quando = new Date(input.quando);
  if (Number.isNaN(quando.getTime())) return { ok: false, error: "Data inválida." };

  const visiveis = await empresasVisiveis(usuario);
  const alocacao = await prisma.alocacaoVeiculo.findFirst({
    where: {
      empresaId: { in: visiveis },
      veiculoId: input.veiculoId,
      dataInicio: { lte: quando },
      OR: [{ dataFim: null }, { dataFim: { gte: quando } }],
    },
    orderBy: { dataInicio: "desc" },
    select: { condutorId: true, condutor: { select: { colaborador: { select: { nome: true } } } } },
  });

  return {
    ok: true,
    condutorId: alocacao?.condutorId ?? null,
    nome: alocacao?.condutor.colaborador.nome ?? null,
  };
}

/** Indica o condutor e fecha o relógio de 30 dias. */
export async function indicarCondutor(input: {
  empresaId: string;
  infracaoId: string;
  condutorId: string;
  formaIndicacao: string;
}): Promise<ActionResult & { aviso?: string }> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const [infracao, condutor] = await Promise.all([
    prisma.infracao.findFirst({
      where: { id: input.infracaoId, empresaId: { in: visiveis } },
      select: { id: true, empresaId: true, numeroAIT: true, prazoIndicacaoCondutor: true, statusIndicacao: true },
    }),
    prisma.condutor.findFirst({
      where: { id: input.condutorId, empresaId: { in: visiveis } },
      select: { id: true, colaborador: { select: { nome: true } } },
    }),
  ]);
  if (!infracao) return { ok: false, error: "Multa não encontrada no seu acesso." };
  if (!condutor) return { ok: false, error: "Condutor não encontrado no seu acesso." };

  // Reindicar não existe: a indicação é ato formal perante o órgão autuador, e
  // uma segunda por cima só embaralharia o registro do que foi comunicado.
  // Corrigir indicação errada é caso para o suporte, com trilha — não para um
  // segundo clique.
  if (infracao.statusIndicacao !== "PENDENTE") {
    return { ok: false, error: "Esta multa já teve condutor indicado. Registro não alterado." };
  }

  // Indicar depois do prazo não é bloqueado — o registro tem que refletir o que
  // aconteceu, inclusive quando aconteceu tarde. O que muda é o status, para a
  // Central parar de cobrar e o histórico dizer a verdade.
  const hoje = hojeUTC();
  const atrasada = infracao.prazoIndicacaoCondutor ? hoje > infracao.prazoIndicacaoCondutor : false;

  // Não há mais acumulador de pontos sendo somado aqui, e é de propósito: os
  // pontos do condutor são DERIVADOS das infrações indicadas a ele nos últimos
  // 12 meses (tela de Condutores) — pontuação no CTB expira em janela móvel, e
  // um acumulador nunca esquece: reindicação somaria duas vezes, correção não
  // estornaria, e um ano depois o sistema acusaria alguém de estar perto da
  // suspensão por pontos que a lei já apagou.
  await prisma.infracao.update({
    where: { id: infracao.id },
    data: {
      condutorIndicadoId: condutor.id,
      dataIndicacao: new Date(),
      formaIndicacao: input.formaIndicacao,
      statusIndicacao: atrasada ? "PERDIDO" : "INDICADO",
    },
  });

  await registrarAuditoria({
    empresaId: infracao.empresaId,
    acao: "VINCULAR",
    entidade: "Infracao",
    entidadeId: infracao.id,
    resumo: `Indicou ${condutor.colaborador.nome} como condutor na multa ${infracao.numeroAIT}${atrasada ? " (fora do prazo)" : ""}`,
  });

  revalidatePath(caminho(input.empresaId));
  // A escrita ACONTECEU — devolver ok:false aqui faria qualquer chamador
  // honesto tratar como falha e tentar de novo, regravando. Sucesso com aviso
  // é `ok: true` + `aviso`.
  return atrasada
    ? { ok: true, aviso: "Indicação registrada, mas FORA do prazo de 30 dias — a multa por não identificação já é devida." }
    : { ok: true };
}

/** Compra e venda de veículo, com os dois relógios do CTB já calculados. */
export async function registrarTransferencia(input: {
  empresaId: string;
  veiculoId: string;
  tipo: string;
  contraparteNome?: string | null;
  contraparteDocumento?: string | null;
  municipioContraparte?: string | null;
  dataNegocio: string;
  modalidadeAtpv?: string | null;
}): Promise<ActionResult> {
  const usuario = await requireProcessosEmpresa(input.empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const veiculo = await prisma.veiculo.findFirst({
    where: { id: input.veiculoId, empresaId: { in: visiveis } },
    select: { id: true, placa: true, empresaId: true },
  });
  if (!veiculo) return { ok: false, error: "Veículo não encontrado no seu acesso." };

  const dataNegocio = dataDoFormulario(input.dataNegocio);
  if (!dataNegocio) return { ok: false, error: "Informe a data do negócio." };

  const ehVenda = input.tipo === "VENDA";
  const modalidadeAtpv = input.modalidadeAtpv ?? "ELETRONICA";

  await prisma.transferenciaVeiculo.create({
    data: {
      empresaId: veiculo.empresaId,
      veiculoId: veiculo.id,
      tipo: input.tipo,
      contraparteNome: (input.contraparteNome ?? "").trim() || null,
      contraparteDocumento: (input.contraparteDocumento ?? "").replace(/\D/g, "") || null,
      municipioContraparte: (input.municipioContraparte ?? "").trim() || null,
      dataNegocio,
      modalidadeAtpv,
      // Comprando, 30 dias para o novo CRV (art. 123, §1º).
      prazoNovoCrv: ehVenda ? null : somarDiasUTC(dataNegocio, DIAS_NOVO_CRV),
      // Vendendo, a janela do art. 134 é 60 dias contados do FIM dos 30 do
      // comprador — do 30º ao 90º dia. Somar 60 direto encerraria o prazo um
      // mês antes do que a lei manda.
      //
      // E só a ATPV IMPRESSA gera a tarefa: assinar a ATPV-e eletronicamente já
      // vale como comunicação de venda.
      prazoComunicacaoVenda:
        ehVenda && modalidadeAtpv === "IMPRESSA" ? somarDiasUTC(dataNegocio, DIAS_COMUNICACAO_VENDA) : null,
      // A eletrônica já nasce comunicada — é o que a evita virar pendência.
      dataComunicacaoVenda: ehVenda && modalidadeAtpv === "ELETRONICA" ? dataNegocio : null,
      criadoPorId: usuario.id,
      criadoPorNome: usuario.name ?? usuario.username,
    },
  });

  if (ehVenda) {
    await prisma.veiculo.update({
      where: { id: veiculo.id },
      data: { situacao: "VENDIDO", dataVenda: dataNegocio },
    });
  }

  await registrarAuditoria({
    empresaId: veiculo.empresaId,
    acao: "CRIAR",
    entidade: "TransferenciaVeiculo",
    entidadeId: veiculo.id,
    resumo: `Registrou ${ehVenda ? "a venda" : "a compra"} do veículo ${formatarPlaca(veiculo.placa)}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}
