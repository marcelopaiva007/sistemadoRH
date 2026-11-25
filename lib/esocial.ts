// Os eventos do eSocial que o escritório contábil precisa transmitir, com o
// prazo de cada um — a leitura do banco em cima das regras puras de
// lib/prazos-legais.ts (26/11/2026).
//
// UMA função monta a lista (`eventosEsocial`), e TRÊS lugares leem dela: a
// tela /rh/<empresa>/esocial, o contador `esocialAEnviar` de lib/pendencias.ts
// e o CSV para o escritório (app/api/rh/[empresaId]/esocial/[tipo]/csv). Com
// a regra num lugar só, o número do cartão, a lista da tela e as linhas do
// arquivo não têm como divergir.
//
// O que conta no cartão de Pendências: evento sem marcação de envio, de
// admissão, desligamento ou afastamento. A CAT (S-2210) aparece na tela com o
// prazo, mas NÃO soma no cartão novo — ela já é a pendência "CAT sem emitir"
// (catPendente), e contá-la de novo faria o mesmo acidente pesar duas vezes no
// total. CAT com `catEmitida` conta como enviada: emitir a CAT É o S-2210.

import { prisma, type Cliente } from "@/lib/prisma";
import { dataBrasilia, formatarData, formatarDataHoraBrasilia, anosCompletos } from "@/lib/datas";
import {
  ESOCIAL_PRAZOS_DESDE,
  TIPOS_AUSENCIA_DO_S2230,
  avisoPrevioDevido,
  contratoGeraEventoDeEmpregado,
  prazoAdmissao,
  prazoAfastamento,
  prazoCat,
  prazoRescisao,
  prazoTransferenciaGrupo,
  referenciaDoEvento,
  type TipoEventoEsocial,
} from "@/lib/prazos-legais";
import { motivoDesligamentoLabel, tipoAusenciaLabel, tipoContratoLabel } from "@/lib/constants-dp";
import { tipoAcidenteLabel } from "@/lib/constants-cat";

export type EnvioDoEvento = {
  /** Nulo quando o "envio" é a própria CAT emitida (não há marcação a desfazer). */
  id: string | null;
  enviadoEm: Date;
  enviadoPorNome: string | null;
  observacao: string | null;
};

export type EventoEsocial = {
  tipo: TipoEventoEsocial;
  referenciaId: string;
  /** CNPJ do fato — é por ele que a tela e o contador escopam. */
  empresaId: string;
  empresaNome: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Data do fato: admissão, desligamento, acidente (dia em Brasília), início do afastamento. */
  dataEvento: Date;
  prazo: Date;
  regra: string;
  /** Uma linha de contexto para a tela (motivo, tipo do afastamento…). */
  detalhe: string;
  /** Soma em `esocialAEnviar` quando pendente — só a CAT não soma (ver o cabeçalho). */
  contaNoCartao: boolean;
  envio: EnvioDoEvento | null;
};

const chave = (tipo: string, referenciaId: string) => `${tipo}|${referenciaId}`;

/**
 * Todos os eventos dos CNPJs pedidos, a partir de ESOCIAL_PRAZOS_DESDE —
 * pendentes e já enviados. Ordenados pelo prazo, o mais apertado primeiro.
 *
 * Quem chama passa CNPJs JÁ recortados pelo que o usuário enxerga (a
 * interseção de `?empresas=` com empresasVisiveis): esta função não decide
 * acesso, só lê.
 */
export async function eventosEsocial(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<EventoEsocial[]> {
  if (empresaIds.length === 0) return [];
  const desde = ESOCIAL_PRAZOS_DESDE;
  // Um dia de folga na busca do acidente: `dataHora` é instante, e o acidente
  // das 22h de 31/10 em Brasília já é 01/11 em UTC. O corte de verdade é no
  // dia de Brasília, logo abaixo.
  const desdeInstante = new Date(desde.getTime() - 86_400_000);

  const [empresas, admitidos, desligados, acidentes, ausencias, envios] = await Promise.all([
    cliente.empresa.findMany({ where: { id: { in: empresaIds } }, select: { id: true, nome: true } }),
    cliente.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, dataAdmissao: { gte: desde } },
      select: { id: true, nome: true, empresaId: true, dataAdmissao: true, tipoContrato: true },
    }),
    cliente.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, dataDesligamento: { gte: desde } },
      select: {
        id: true,
        nome: true,
        empresaId: true,
        dataAdmissao: true,
        dataDesligamento: true,
        motivoDesligamento: true,
        tipoContrato: true,
      },
    }),
    cliente.acidenteTrabalho.findMany({
      where: { empresaId: { in: empresaIds }, dataHora: { gte: desdeInstante } },
      select: {
        id: true,
        empresaId: true,
        dataHora: true,
        tipo: true,
        catEmitida: true,
        catNumero: true,
        catEmitidaEm: true,
        colaborador: {
          select: { id: true, nome: true, motivoDesligamento: true, dataDesligamento: true },
        },
      },
    }),
    cliente.ausencia.findMany({
      where: {
        empresaId: { in: empresaIds },
        dataInicio: { gte: desde },
        tipo: { in: [...TIPOS_AUSENCIA_DO_S2230] },
        // Recusada ou cancelada não aconteceu. PENDENTE entra: o afastamento
        // existe antes de o RH aprovar o papel, e o prazo corre igual.
        status: { notIn: ["REPROVADA", "CANCELADA"] },
      },
      select: {
        id: true,
        empresaId: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        dias: true,
        acidente: { select: { id: true } },
        colaborador: { select: { id: true, nome: true, tipoContrato: true } },
      },
    }),
    cliente.eventoEsocialEnvio.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true, tipo: true, referenciaId: true, enviadoEm: true, enviadoPorNome: true, observacao: true },
    }),
  ]);

  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const envioPor = new Map(envios.map((e) => [chave(e.tipo, e.referenciaId), e]));
  const marcado = (tipo: TipoEventoEsocial, referenciaId: string): EnvioDoEvento | null => {
    const e = envioPor.get(chave(tipo, referenciaId));
    return e ? { id: e.id, enviadoEm: e.enviadoEm, enviadoPorNome: e.enviadoPorNome, observacao: e.observacao } : null;
  };

  const eventos: EventoEsocial[] = [];

  for (const c of admitidos) {
    if (!c.dataAdmissao || !contratoGeraEventoDeEmpregado(c.tipoContrato)) continue;
    const referenciaId = referenciaDoEvento(c.id, c.dataAdmissao);
    const p = prazoAdmissao(c.dataAdmissao);
    eventos.push({
      tipo: "S2200",
      referenciaId,
      empresaId: c.empresaId,
      empresaNome: nomeEmpresa.get(c.empresaId) ?? "",
      colaboradorId: c.id,
      colaboradorNome: c.nome,
      dataEvento: c.dataAdmissao,
      ...p,
      detalhe: c.tipoContrato ? tipoContratoLabel(c.tipoContrato) : "Contrato sem tipo na ficha",
      contaNoCartao: true,
      envio: marcado("S2200", referenciaId),
    });
  }

  for (const c of desligados) {
    if (!c.dataDesligamento || !contratoGeraEventoDeEmpregado(c.tipoContrato)) continue;
    const referenciaId = referenciaDoEvento(c.id, c.dataDesligamento);
    // Transferência no grupo não tem rescisão: mesmo prazo de envio, texto
    // sem pagamento (26/11/2026 — o texto do art. 477 aparecia nela).
    const p =
      c.motivoDesligamento === "TRANSFERENCIA_GRUPO"
        ? prazoTransferenciaGrupo(c.dataDesligamento)
        : prazoRescisao(c.dataDesligamento);
    const aviso = c.dataAdmissao
      ? avisoPrevioDevido(c.motivoDesligamento, anosCompletos(c.dataAdmissao, c.dataDesligamento))
      : null;
    eventos.push({
      tipo: "S2299",
      referenciaId,
      empresaId: c.empresaId,
      empresaNome: nomeEmpresa.get(c.empresaId) ?? "",
      colaboradorId: c.id,
      colaboradorNome: c.nome,
      dataEvento: c.dataDesligamento,
      ...p,
      detalhe: [
        c.motivoDesligamento ? motivoDesligamentoLabel(c.motivoDesligamento) : "Motivo não informado",
        aviso && aviso.dias !== null ? `aviso ${aviso.texto}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      contaNoCartao: true,
      envio: marcado("S2299", referenciaId),
    });
  }

  for (const a of acidentes) {
    const dia = dataBrasilia(a.dataHora);
    if (dia < desde) continue;
    // Óbito não tem campo: é o desligamento por falecimento a partir do dia
    // do acidente. Na dúvida (falecimento registrado depois), o prazo vira o
    // do próprio dia — o mais curto.
    const obito =
      a.colaborador.motivoDesligamento === "FALECIMENTO" &&
      !!a.colaborador.dataDesligamento &&
      a.colaborador.dataDesligamento >= dia;
    const p = prazoCat(dia, obito);
    eventos.push({
      tipo: "S2210",
      referenciaId: a.id,
      empresaId: a.empresaId,
      empresaNome: nomeEmpresa.get(a.empresaId) ?? "",
      colaboradorId: a.colaborador.id,
      colaboradorNome: a.colaborador.nome,
      dataEvento: dia,
      ...p,
      detalhe: tipoAcidenteLabel(a.tipo) + (obito ? " · óbito" : ""),
      contaNoCartao: false,
      envio: a.catEmitida
        ? {
            id: null,
            enviadoEm: a.catEmitidaEm ?? a.dataHora,
            enviadoPorNome: null,
            observacao: a.catNumero ? `CAT emitida nº ${a.catNumero}` : "CAT emitida",
          }
        : marcado("S2210", a.id),
    });
  }

  for (const a of ausencias) {
    if (!contratoGeraEventoDeEmpregado(a.colaborador.tipoContrato)) continue;
    const p = prazoAfastamento({
      tipo: a.tipo,
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
      dias: a.dias,
      ligadoAAcidente: a.acidente !== null,
    });
    if (!p) continue;
    eventos.push({
      tipo: "S2230",
      referenciaId: a.id,
      empresaId: a.empresaId,
      empresaNome: nomeEmpresa.get(a.empresaId) ?? "",
      colaboradorId: a.colaborador.id,
      colaboradorNome: a.colaborador.nome,
      dataEvento: a.dataInicio,
      ...p,
      detalhe: `${tipoAusenciaLabel(a.tipo)} · ${formatarData(a.dataInicio)} a ${formatarData(a.dataFim)}`,
      contaNoCartao: true,
      envio: marcado("S2230", a.id),
    });
  }

  return eventos.sort((x, y) => x.prazo.getTime() - y.prazo.getTime());
}

/** Pendente e contado no cartão — a régua de `esocialAEnviar`. */
export const contaComoPendencia = (e: EventoEsocial) => e.envio === null && e.contaNoCartao;

/** `esocialAEnviar` por CNPJ, para lib/pendencias.ts. */
export async function esocialAEnviarPorEmpresa(
  cliente: Cliente,
  empresaIds: string[],
): Promise<Map<string, number>> {
  const porEmpresa = new Map<string, number>();
  for (const e of await eventosEsocial(empresaIds, cliente)) {
    if (!contaComoPendencia(e)) continue;
    porEmpresa.set(e.empresaId, (porEmpresa.get(e.empresaId) ?? 0) + 1);
  }
  return porEmpresa;
}

// ------------------------------------------------------------------
// Planilha para o escritório
// ------------------------------------------------------------------

export type Planilha = { cabecalho: string[]; linhas: string[][] };

const data = (d: Date | null | undefined) => (d ? formatarData(d) : "");
const texto = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const dinheiro = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toFixed(2).replace(".", ","));

// Campos comuns de identificação — o que o escritório usa para achar a pessoa
// no sistema dele. Só o que a ficha TEM; nada é inventado ou preenchido por
// padrão.
const IDENTIFICACAO = ["Empresa", "CNPJ", "Razao social", "Matricula", "Nome", "CPF", "PIS"];
const SITUACAO = ["Prazo", "Regra do prazo", "Situacao", "Enviado ao escritorio em", "Enviado por", "Observacao"];

const selecaoIdentificacao = {
  nome: true,
  matricula: true,
  cpf: true,
  pis: true,
  razaoSocial: true,
  empresa: { select: { nome: true, cnpj: true, razaoSocial: true } },
} as const;

type Identificacao = {
  nome: string;
  matricula: string | null;
  cpf: string | null;
  pis: string | null;
  razaoSocial: string | null;
  empresa: { nome: string; cnpj: string | null; razaoSocial: string | null };
};

const identificacao = (c: Identificacao) => [
  c.empresa.nome,
  texto(c.empresa.cnpj),
  texto(c.razaoSocial ?? c.empresa.razaoSocial),
  texto(c.matricula),
  c.nome,
  texto(c.cpf),
  texto(c.pis),
];

const situacao = (e: EventoEsocial) => [
  data(e.prazo),
  e.regra,
  e.envio ? "Enviado" : "Pendente",
  e.envio ? formatarDataHoraBrasilia(e.envio.enviadoEm) : "",
  texto(e.envio?.enviadoPorNome),
  texto(e.envio?.observacao),
];

/**
 * As linhas do CSV de um tipo de evento: os MESMOS eventos da tela (vindos de
 * `eventosEsocial`), com os campos que o escritório precisa para montar o
 * evento. Campo que o sistema não guarda não entra — o escritório completa.
 */
export async function planilhaDoEvento(
  tipo: TipoEventoEsocial,
  eventos: EventoEsocial[],
  cliente: Cliente = prisma,
): Promise<Planilha> {
  const doTipo = eventos.filter((e) => e.tipo === tipo);

  if (tipo === "S2200") {
    const fichas = await cliente.colaborador.findMany({
      where: { id: { in: doTipo.map((e) => e.colaboradorId) } },
      select: {
        id: true,
        ...selecaoIdentificacao,
        dataNascimento: true,
        sexo: true,
        estadoCivil: true,
        escolaridade: true,
        nacionalidade: true,
        naturalidade: true,
        nomeMae: true,
        nomePai: true,
        rg: true,
        rgOrgaoEmissor: true,
        rgUf: true,
        ctpsNumero: true,
        ctpsSerie: true,
        ctpsUf: true,
        tituloEleitor: true,
        cep: true,
        logradouro: true,
        numeroEndereco: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        telefone: true,
        email: true,
        dataAdmissao: true,
        tipoContrato: true,
        dataFimContrato: true,
        jornadaSemanal: true,
        salarioBase: true,
        posicao: { select: { nome: true } },
        setor: { select: { nome: true } },
      },
    });
    const porId = new Map(fichas.map((f) => [f.id, f]));
    return {
      cabecalho: [
        ...IDENTIFICACAO,
        "Data de nascimento",
        "Sexo",
        "Estado civil",
        "Escolaridade",
        "Nacionalidade",
        "Naturalidade",
        "Nome da mae",
        "Nome do pai",
        "RG",
        "RG orgao emissor",
        "RG UF",
        "CTPS numero",
        "CTPS serie",
        "CTPS UF",
        "Titulo de eleitor",
        "CEP",
        "Logradouro",
        "Numero",
        "Complemento",
        "Bairro",
        "Cidade",
        "UF",
        "Telefone",
        "E-mail",
        "Data de admissao",
        "Tipo de contrato",
        "Fim do contrato",
        "Cargo",
        "Setor",
        "Jornada semanal (h)",
        "Salario base",
        ...SITUACAO,
      ],
      linhas: doTipo.flatMap((e) => {
        const f = porId.get(e.colaboradorId);
        if (!f) return [];
        return [
          [
            ...identificacao(f),
            data(f.dataNascimento),
            texto(f.sexo),
            texto(f.estadoCivil),
            texto(f.escolaridade),
            texto(f.nacionalidade),
            texto(f.naturalidade),
            texto(f.nomeMae),
            texto(f.nomePai),
            texto(f.rg),
            texto(f.rgOrgaoEmissor),
            texto(f.rgUf),
            texto(f.ctpsNumero),
            texto(f.ctpsSerie),
            texto(f.ctpsUf),
            texto(f.tituloEleitor),
            texto(f.cep),
            texto(f.logradouro),
            texto(f.numeroEndereco),
            texto(f.complemento),
            texto(f.bairro),
            texto(f.cidade),
            texto(f.uf),
            texto(f.telefone),
            texto(f.email),
            data(f.dataAdmissao),
            f.tipoContrato ? tipoContratoLabel(f.tipoContrato) : "",
            data(f.dataFimContrato),
            f.posicao.nome,
            f.setor.nome,
            texto(f.jornadaSemanal),
            dinheiro(f.salarioBase),
            ...situacao(e),
          ],
        ];
      }),
    };
  }

  if (tipo === "S2299") {
    const fichas = await cliente.colaborador.findMany({
      where: { id: { in: doTipo.map((e) => e.colaboradorId) } },
      select: {
        id: true,
        ...selecaoIdentificacao,
        dataAdmissao: true,
        dataDesligamento: true,
        motivoDesligamento: true,
        transferidoParaEmpresaId: true,
        tipoContrato: true,
        salarioBase: true,
        posicao: { select: { nome: true } },
      },
    });
    const destinos = await cliente.empresa.findMany({
      where: { id: { in: fichas.map((f) => f.transferidoParaEmpresaId).filter((x): x is string => !!x) } },
      select: { id: true, nome: true, cnpj: true },
    });
    const destinoPor = new Map(destinos.map((d) => [d.id, d]));
    const porId = new Map(fichas.map((f) => [f.id, f]));
    return {
      cabecalho: [
        ...IDENTIFICACAO,
        "Cargo",
        "Tipo de contrato",
        "Data de admissao",
        "Data de desligamento",
        "Motivo",
        "Transferido para (CNPJ do grupo)",
        "Anos completos de servico",
        "Aviso previo devido (dias)",
        "Aviso previo (observacao)",
        "Salario base",
        ...SITUACAO,
      ],
      linhas: doTipo.flatMap((e) => {
        const f = porId.get(e.colaboradorId);
        if (!f || !f.dataDesligamento) return [];
        const anos = f.dataAdmissao ? anosCompletos(f.dataAdmissao, f.dataDesligamento) : null;
        const aviso = anos !== null ? avisoPrevioDevido(f.motivoDesligamento, anos) : null;
        const destino = f.transferidoParaEmpresaId ? destinoPor.get(f.transferidoParaEmpresaId) : undefined;
        return [
          [
            ...identificacao(f),
            f.posicao.nome,
            f.tipoContrato ? tipoContratoLabel(f.tipoContrato) : "",
            data(f.dataAdmissao),
            data(f.dataDesligamento),
            f.motivoDesligamento ? motivoDesligamentoLabel(f.motivoDesligamento) : "",
            destino ? `${destino.nome}${destino.cnpj ? ` (${destino.cnpj})` : ""}` : "",
            texto(anos),
            texto(aviso?.dias),
            texto(aviso?.texto),
            dinheiro(f.salarioBase),
            ...situacao(e),
          ],
        ];
      }),
    };
  }

  if (tipo === "S2210") {
    const acidentes = await cliente.acidenteTrabalho.findMany({
      where: { id: { in: doTipo.map((e) => e.referenciaId) } },
      select: {
        id: true,
        dataHora: true,
        tipo: true,
        local: true,
        descricao: true,
        parteCorpoAtingida: true,
        natureza: true,
        houveAfastamento: true,
        catEmitida: true,
        catNumero: true,
        testemunhas: true,
        colaborador: {
          select: {
            ...selecaoIdentificacao,
            dataNascimento: true,
            sexo: true,
            posicao: { select: { nome: true } },
          },
        },
      },
    });
    const porId = new Map(acidentes.map((a) => [a.id, a]));
    return {
      cabecalho: [
        ...IDENTIFICACAO,
        "Data de nascimento",
        "Sexo",
        "Cargo",
        "Data e hora do acidente (Brasilia)",
        "Tipo",
        "Local",
        "Descricao",
        "Parte do corpo atingida",
        "Natureza da lesao",
        "Houve afastamento",
        "Obito",
        "CAT emitida",
        "Numero da CAT",
        "Testemunhas",
        ...SITUACAO,
      ],
      linhas: doTipo.flatMap((e) => {
        const a = porId.get(e.referenciaId);
        if (!a) return [];
        return [
          [
            ...identificacao(a.colaborador),
            data(a.colaborador.dataNascimento),
            texto(a.colaborador.sexo),
            a.colaborador.posicao.nome,
            formatarDataHoraBrasilia(a.dataHora),
            tipoAcidenteLabel(a.tipo),
            texto(a.local),
            a.descricao,
            texto(a.parteCorpoAtingida),
            texto(a.natureza),
            a.houveAfastamento ? "Sim" : "Nao",
            e.detalhe.includes("óbito") ? "Sim" : "Nao",
            a.catEmitida ? "Sim" : "Nao",
            texto(a.catNumero),
            texto(a.testemunhas),
            ...situacao(e),
          ],
        ];
      }),
    };
  }

  // S2230
  const ausencias = await cliente.ausencia.findMany({
    where: { id: { in: doTipo.map((e) => e.referenciaId) } },
    select: {
      id: true,
      tipo: true,
      dataInicio: true,
      dataFim: true,
      dias: true,
      cid: true,
      profissional: true,
      registroProfissional: true,
      status: true,
      acidente: { select: { dataHora: true, catNumero: true } },
      colaborador: { select: { ...selecaoIdentificacao } },
    },
  });
  const porId = new Map(ausencias.map((a) => [a.id, a]));
  return {
    cabecalho: [
      ...IDENTIFICACAO,
      "Tipo de afastamento",
      "Inicio",
      "Fim",
      "Dias",
      "CID",
      "Profissional",
      "Registro do profissional",
      "Acidente de trabalho vinculado (data)",
      "Numero da CAT",
      "Situacao no RH",
      ...SITUACAO,
    ],
    linhas: doTipo.flatMap((e) => {
      const a = porId.get(e.referenciaId);
      if (!a) return [];
      return [
        [
          ...identificacao(a.colaborador),
          tipoAusenciaLabel(a.tipo),
          data(a.dataInicio),
          data(a.dataFim),
          texto(a.dias),
          texto(a.cid),
          texto(a.profissional),
          texto(a.registroProfissional),
          a.acidente ? formatarDataHoraBrasilia(a.acidente.dataHora) : "",
          texto(a.acidente?.catNumero),
          a.status === "APROVADA" ? "Aprovada" : "Aguardando aprovação",
          ...situacao(e),
        ],
      ];
    }),
  };
}

/**
 * Confere que um evento existe AGORA, com a mesma chave, nestes CNPJs — a
 * base das actions de marcar/desmarcar envio. Devolve o evento calculado, ou
 * null (sumiu, mudou de data, ou é de CNPJ fora do recorte).
 */
export async function eventoAtual(
  empresaIds: string[],
  tipo: TipoEventoEsocial,
  referenciaId: string,
  cliente: Cliente = prisma,
): Promise<EventoEsocial | null> {
  const eventos = await eventosEsocial(empresaIds, cliente);
  return eventos.find((e) => e.tipo === tipo && e.referenciaId === referenciaId) ?? null;
}
