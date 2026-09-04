import { prisma, type Cliente } from "@/lib/prisma";
import { PENDENCIAS_DECIDIR, PENDENCIAS_PRAZO, PENDENCIAS_CADASTRO } from "./pendencias-natureza";
import { Prisma } from "@/app/generated/prisma/client";
import {
  DIAS_ALERTA_VENCIMENTO,
  CONTRATOS_POR_PRAZO,
  PRIMEIRO_DESLIGAMENTO_COBRADO,
} from "@/lib/constants-dp";
import { RUBRICAS_HORA_EXTRA, LIMITE_HORAS_EXTRAS_MES } from "@/lib/constants-folha";
import { hojeUTC, somarDiasUTC, diferencaEmDiasUTC } from "@/lib/datas";

export type Pendencias = {
  aprovacoes: number;
  documentosAConferir: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
  // Situações adicionadas em 03/08/2026 — a primeira versão desta leva
  // referenciava campos que não existiam e derrubou o deploy; estas seis são
  // as que têm base real no schema.
  feriasVencidas: number;
  avisoPrevio: number;
  desligamentosIncompletos: number;
  // Era `avaliacoesAtrasadas` (cada avaliação PENDENTE de ciclo com janela
  // fechada) até 10/08/2026. Um ciclo esquecido com 235 avaliações pendentes
  // virava 235 itens no total — como se o RH tivesse 235 ações separadas. A
  // ação é UMA por ciclo: cobrar os avaliadores e encerrar (encerrarCiclo em
  // lib/actions/rh-avaliacao.ts). Mesma régua de `pesquisasAbertas`, logo
  // abaixo: conta a unidade que o RH fecha, nunca pessoa a pessoa.
  ciclosAvaliacaoAEncerrar: number;
  // Era `convitesSemResposta` (pessoa com convite de pesquisa ativa e ainda sem
  // responder) até 06/08/2026. Responder pesquisa é OPCIONAL: parte do time
  // nunca responde, por direito, e isso não é falha do RH nem tem ação do RH
  // que resolva — o contador só inflava o total com algo que ninguém podia
  // fechar. O que de fato espera o RH é ENCERRAR a pesquisa: enquanto ela fica
  // ACTIVE o resultado não fecha (nivelGeralCache/indiceGeralCache só são
  // gravados no encerramento) e o ciclo seguinte não começa.
  pesquisasAbertas: number;
  fichasDesatualizadas: number;
  // Fechadas em 04/08/2026, completando a ideia original. Três saíram do que já
  // existia no schema; a de contrato exigiu a coluna `dataFimContrato`
  // (migration 20260804160000), porque o tipo do contrato estava lá mas a data
  // em que ele acaba, não.
  //
  // A quinta situação da lista original — "movimentação pendente" — não entrou,
  // e não é esquecimento: Movimentacao é histórico, não fila. Ela nasce na
  // mesma transação que altera o Colaborador (ver o comentário do model), então
  // não existe movimentação por aplicar. Cobrar uma seria inventar um estado
  // que o sistema não tem.
  contratosVencendo: number;
  horasExtrasExcedidas: number;
  dependentesSemCpf: number;
  atestadosSemDocumento: number;
  // Pedido do CEO em 07/08/2026: era só "preenchimento da base" (lacuna), mas
  // sem o vínculo a pessoa não recebe convite de pesquisa, lembrete nem acesso
  // ao portal — é cobrança do RH, não estatística. Mesma condição da lacuna e
  // da lista (?lacuna=telegram): ativo com telegramChatId nulo OU vazio.
  semTelegram: number;
  // Ficha de colaborador ativo com campo essencial em branco. Ver
  // CADASTRO_INCOMPLETO_WHERE / cadastroIncompleto logo abaixo: a regra é uma
  // só, usada pela contagem e pelo filtro da lista.
  cadastrosIncompletos: number;
  // Ativo no setor "Não definido". Pedido do CEO em 27/08/2026: já era lacuna
  // na tela inicial, mas lacuna não chega ao e-mail diário de cobrança — e sem
  // setor a pessoa fica fora do Painel do setor, do placar e da conta de
  // turnover por setor. Mesma condição de lib/dashboard.ts::lacunasDaBase
  // (nome "Não definido", sem diferenciar caixa). Hoje nasce zerada — a
  // organização de 27/08 esvaziou o balde de ativos — e fica de vigia para
  // importação futura que entre sem setor.
  semSetor: number;

  // ------------------------------------------------------------------
  // As OITO situações abaixo entraram em 19/08/2026, depois de uma varredura
  // que comparou estado-por-estado o que o schema guarda de pendente com o que
  // esta lista contava. Todas já eram tratadas como fila de trabalho em ALGUMA
  // tela do sistema — só não chegavam aqui, e portanto não chegavam nem ao
  // indicador do topo da tela do grupo nem ao e-mail diário de
  // lib/cobranca-rh-pendencias.ts, que leem daqui e de mais lugar nenhum.
  //
  // Acréscimo, não troca: nenhuma das 19 anteriores mudou de regra, de grupo
  // ou de nome.
  // ------------------------------------------------------------------

  /**
   * Ajuste de ponto (TratamentoPonto) esperando aprovar ou rejeitar.
   *
   * Era a lacuna mais grave da lista. A tela de Aprovações passou a buscar
   * `tratamentoPonto` PENDENTE em 11/08/2026 — ela se anuncia como "tudo que
   * espera uma decisão do RH num lugar só" — e este contador não acompanhou.
   * Efeito: empresa com 12 ajustes parados e mais nada lia "Nada esperando
   * ação" nesta tela E não recebia o e-mail diário (o cron pula quando o total
   * é 0), justamente no módulo que tem fiscalização de jornada em cima.
   *
   * Chave própria em vez de somar dentro de `aprovacoes`, de propósito: férias
   * e ausência já dividem aquele número porque a decisão é a mesma (abonar ou
   * não). Ponto não é — quem trata marcação está conferindo jornada, não
   * concedendo benefício, e juntar os dois esconderia qual fila cresceu.
   */
  ajustesPontoPendentes: number;

  /**
   * "Fale com o RH" do portal sem resposta — `MensagemPortal.respondidaEm` nulo.
   *
   * É o caso mais literal possível do grupo DECIDIR: uma pessoa escreveu e está
   * esperando. A tela /mensagens já ordena as abertas primeiro; faltava alguém
   * dizer quantas são sem precisar abrir a tela.
   */
  mensagensSemResposta: number;

  /**
   * Entrega registrada e ainda não confirmada pelo colaborador.
   *
   * O cabeçalho de entregas/page.tsx diz que a pergunta que aquela tela existe
   * para responder é "quem ainda não confirmou?" — e essa pergunta não chegava
   * aqui. Sem a confirmação não há prova de que o notebook, o cartão ou o
   * uniforme foram entregues, que é o ponto inteiro do módulo.
   *
   * Devolvido sai da conta: item devolvido não tem mais o que confirmar. Só
   * colaborador ativo, mesma régua de asoVencendo/epiVencido — cobrar
   * confirmação de quem já saiu é cobrar o impossível.
   */
  entregasNaoConfirmadas: number;

  /**
   * Advertência ou suspensão emitida sem assinatura colhida.
   *
   * `statusAssinatura` nasce PENDENTE. Enquanto ficar assim o documento não
   * sustenta a penalidade numa reclamatória — e quanto mais tempo passa entre o
   * fato e a assinatura, menos defensável fica. Só ativo: quem já saiu não tem
   * como assinar.
   */
  disciplinarSemAssinatura: number;

  /**
   * Plano de ação com prazo vencido, nem concluído nem cancelado.
   *
   * O sistema JÁ tratava isto como pendência em dois lugares: o alerta AL09
   * (lib/alertas.ts) manda e-mail para a diretoria e o gestor do setor, e o
   * mesmo achado vira `Sinal` de gravidade ALTA na Central. Só a tela de
   * Pendências não sabia. Mesma regra do AL09, palavra por palavra, para os
   * três contarem a mesma coisa.
   */
  planosAcaoVencidos: number;

  /**
   * Desligado sem NENHUM item de offboarding criado.
   *
   * `desligamentosIncompletos` conta item em aberto de um checklist QUE EXISTE.
   * Quem nunca teve checklist criado não aparecia em lugar nenhum — o caso pior
   * passava, o caso parcial era cobrado. A tela /desligamentos já calculava
   * exatamente este número (campo `semChecklist` do resumo).
   *
   * Mesma regra da tela, incluindo `checklistDispensado`: a dispensa existe
   * para zerar quem saiu antes de o sistema existir e cobre o offboarding
   * inteiro. `dataDesligamento` e não `ativo: false` — também como a tela —
   * porque quem está em aviso prévio já precisa do checklist montado.
   *
   * DESDE 20/08/2026 só conta saída a partir de 16/08/2026
   * (PRIMEIRO_DESLIGAMENTO_COBRADO em lib/constants-dp.ts, decisão do CEO):
   * desligamento anterior é passivo histórico da importação, sem offboarding
   * possível de cobrar. O mesmo corte vale em `desligamentosSemEntrevista`,
   * `desligamentosIncompletos` e no resumo da tela /desligamentos.
   */
  desligamentosSemChecklist: number;

  /**
   * Desligado sem entrevista de saída registrada. Mesmo par da anterior: a tela
   * /desligamentos já conta (`semEntrevista`), com a mesma dispensa e o mesmo
   * corte de 16/08/2026 valendo.
   */
  desligamentosSemEntrevista: number;

  /**
   * Sinal CRÍTICO ou ALTO ainda ABERTO na Central — detectado e sem triagem.
   *
   * Só ABERTO: RECONHECIDO e EM_PLANO já tiveram desfecho humano, e contá-los
   * cobraria de novo quem já respondeu. Só CRITICA/ALTA: ATENCAO é lista de
   * observação e inflaria o número sem pedir ação.
   *
   * PLANO_VENCIDO fica DE FORA da conta — é o mesmo fato que
   * `planosAcaoVencidos` acima, e o AL09 grava os dois no mesmo ciclo. Sem esse
   * recorte, todo plano vencido apareceria duas vezes no total da tela, que é
   * exatamente o erro que o filtro por APROVADA evita em
   * `atestadosSemDocumento`.
   */
  sinaisAbertos: number;
};

/**
 * Ficha incompleta: a MESMA regra em dois formatos — filtro do Prisma (para
 * contar) e predicado (para a lista `?lacuna=incompleto` marcar as linhas).
 *
 * As duas TÊM que andar juntas. Se divergirem, o cartão diz "12 cadastros
 * incompletos", o RH clica e a lista mostra 40 — e a tela de pendências perde
 * a credibilidade inteira, não só este número.
 *
 * Contato é o único par: exigir email E telefone marcaria quase toda base
 * operacional, onde a maioria só tem telefone. Falta de contato é não ter
 * nenhum dos dois.
 *
 * A RÉGUA ENCOLHEU EM 12/08/2026, e o motivo é o número: com RG, endereço
 * (logradouro, número, bairro, UF) na conta, o cartão marcava 163 de 170
 * ativos — 96% da base. Contador que aponta para quase todo mundo não é fila
 * de trabalho, é ruído: ninguém abre uma lista de 163 pessoas, e o cartão
 * inteiro passa a ser ignorado junto com os outros ao lado dele.
 *
 * Ficou o que TRAVA alguma coisa: sem CPF ou data de admissão não há eSocial;
 * sem nenhum contato não há como falar com a pessoa. RG e endereço continuam
 * faltando e continuam visíveis na própria ficha — só deixaram de disputar
 * atenção na tela de Pendências.
 *
 * BANCO SAIU EM 13/08/2026, junto com os campos bancários da tela. A chave de
 * pagamento passou a ser o CPF do próprio colaborador (PIX-CPF), e "sem dados
 * bancários não há como pagar" virou "sem CPF não há como pagar" — que a
 * primeira condição desta lista já cobre. Manter banco aqui cobraria um dado
 * que nenhuma tela do sistema aceita mais: o RH veria a pendência, abriria a
 * ficha e não acharia onde preencher.
 *
 * Só `null`, sem `""`: mesmo critério de lib/dashboard.ts::lacunasDaBase, que
 * também trata string vazia à parte apenas no telegramChatId, onde ela de fato
 * aparece nos dados importados.
 */
// Sem `as const`: o Prisma exige `OR` como array mutável, e um literal
// readonly não é atribuível a `ColaboradorWhereInput[]`.
export const CADASTRO_INCOMPLETO_WHERE: Prisma.ColaboradorWhereInput = {
  OR: [
    { cpf: null },
    { dataAdmissao: null },
    { AND: [{ email: null }, { telefone: null }] },
  ],
};

/** Campos lidos por `cadastroIncompleto`. Só o servidor os enxerga. */
export type CamposDoCadastro = {
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  dataAdmissao: Date | null;
  rg: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  bairro: string | null;
  uf: string | null;
};

export function cadastroIncompleto(c: CamposDoCadastro): boolean {
  return (
    c.cpf === null ||
    c.dataAdmissao === null ||
    (c.email === null && c.telefone === null)
  );
}

export const totalPendencias = (p: Pendencias) => Object.values(p).reduce((s, n) => s + n, 0);

/**
 * Plano de ação vencido: a MESMA regra em um lugar só, usada pelo contador
 * daqui, pelo alerta AL09 (lib/alertas.ts) e — via AL09 — pelo Sinal da
 * Central. Era uma cópia "palavra por palavra" nos dois arquivos, e as cópias
 * já tinham divergido no dia-limite: o AL09 comparava com `new Date()` (agora)
 * e este arquivo com `hojeUTC()` (meia-noite UTC) — no dia do prazo a
 * diretoria recebia "vencido" por e-mail e a tela de Pendências mostrava zero.
 *
 * A régua única é `hojeUTC()`: prazo é DATA (meia-noite UTC no banco), e no
 * resto do sistema "venceu" começa no dia SEGUINTE ao prazo (`prazo < hoje`,
 * como integracoesAtrasadas e ciclosAvaliacaoAEncerrar). Quem tem prazo hoje
 * ainda está no prazo.
 */
export const planoAcaoVencidoWhere = (hoje: Date): Prisma.PlanoAcaoWhereInput => ({
  status: { notIn: ["CONCLUIDO", "CANCELADO"] },
  prazo: { lt: hoje },
});

/**
 * Rótulo humano de cada pendência — vive AQUI, ao lado do tipo, porque o
 * Record<keyof Pendencias, string> obriga a lista a acompanhar: pendência sem
 * rótulo não compila. Usado pelo e-mail diário (lib/cobranca-rh-pendencias.ts)
 * e pelo detalhamento dos cartões de marca na tela do grupo — os dois têm que
 * chamar a mesma coisa pelo mesmo nome.
 */
export const ROTULOS_PENDENCIA: Record<keyof Pendencias, string> = {
  aprovacoes: "Aguardando aprovação",
  documentosAConferir: "Documentos a conferir",
  asoVencendo: "ASO vencendo",
  certificadosVencendo: "NR vencendo",
  catPendente: "CAT sem emitir",
  integracoesAtrasadas: "Integração atrasada",
  epiVencido: "EPI vencido",
  feriasVencidas: "Férias vencidas",
  avisoPrevio: "Aviso prévio em curso",
  desligamentosIncompletos: "Desligamento incompleto",
  ciclosAvaliacaoAEncerrar: "Ciclo de avaliação a encerrar",
  pesquisasAbertas: "Pesquisa a encerrar",
  fichasDesatualizadas: "Ficha sem atualização",
  contratosVencendo: "Contrato vencendo",
  horasExtrasExcedidas: "Hora extra acima do limite",
  atestadosSemDocumento: "Atestado sem documento",
  dependentesSemCpf: "Dependente sem CPF",
  cadastrosIncompletos: "Cadastros incompletos",
  semSetor: "Ativo sem setor definido",
  semTelegram: "Sem Telegram vinculado",
  ajustesPontoPendentes: "Ajuste/abono de ponto a decidir",
  mensagensSemResposta: "Mensagem do portal sem resposta",
  entregasNaoConfirmadas: "Entrega sem confirmação",
  disciplinarSemAssinatura: "Medida disciplinar sem assinatura",
  planosAcaoVencidos: "Plano de ação vencido",
  desligamentosSemChecklist: "Desligado sem checklist de saída",
  desligamentosSemEntrevista: "Desligado sem entrevista de saída",
  sinaisAbertos: "Sinal sem triagem",
};

// As listas por natureza moram em lib/pendencias-natureza.ts (sem Prisma,
// para o Client Component da tela de Pendências); aqui ficam a reexportação
// e a prova de cobertura.
export { PENDENCIAS_DECIDIR, PENDENCIAS_PRAZO, PENDENCIAS_CADASTRO };

// A prova de cobertura: o tipo abaixo só resolve para `true` se a união dos
// três grupos for exatamente as chaves de Pendencias — nem faltando, nem
// sobrando, nem repetida.
type ChavesAgrupadas =
  | (typeof PENDENCIAS_DECIDIR)[number]
  | (typeof PENDENCIAS_PRAZO)[number]
  | (typeof PENDENCIAS_CADASTRO)[number];
type CoberturaCompleta = [ChavesAgrupadas] extends [keyof Pendencias]
  ? [keyof Pendencias] extends [ChavesAgrupadas]
    ? true
    : never
  : never;
const _todasAsPendenciasAgrupadas: CoberturaCompleta = true;
void _todasAsPendenciasAgrupadas;

export type PendenciasPorNatureza = {
  /** Alguém espera uma resposta do RH. É a fila do dia. */
  decidir: number;
  /** Data correndo contra: vence, venceu ou atrasou. */
  prazo: number;
  /** Falta dado. Não trava nada hoje. */
  cadastro: number;
};

const somarGrupo = (p: Pendencias, chaves: readonly (keyof Pendencias)[]) =>
  chaves.reduce((s, c) => s + p[c], 0);

export function porNatureza(p: Pendencias): PendenciasPorNatureza {
  return {
    decidir: somarGrupo(p, PENDENCIAS_DECIDIR),
    prazo: somarGrupo(p, PENDENCIAS_PRAZO),
    cadastro: somarGrupo(p, PENDENCIAS_CADASTRO),
  };
}

export const zeradas = (): Pendencias => ({
  aprovacoes: 0,
  documentosAConferir: 0,
  asoVencendo: 0,
  certificadosVencendo: 0,
  catPendente: 0,
  integracoesAtrasadas: 0,
  epiVencido: 0,
  feriasVencidas: 0,
  avisoPrevio: 0,
  desligamentosIncompletos: 0,
  ciclosAvaliacaoAEncerrar: 0,
  pesquisasAbertas: 0,
  fichasDesatualizadas: 0,
  contratosVencendo: 0,
  horasExtrasExcedidas: 0,
  dependentesSemCpf: 0,
  atestadosSemDocumento: 0,
  semTelegram: 0,
  cadastrosIncompletos: 0,
  semSetor: 0,
  ajustesPontoPendentes: 0,
  mensagensSemResposta: 0,
  entregasNaoConfirmadas: 0,
  disciplinarSemAssinatura: 0,
  planosAcaoVencidos: 0,
  desligamentosSemChecklist: 0,
  desligamentosSemEntrevista: 0,
  sinaisAbertos: 0,
});

/**
 * As contagens, em UMA ida ao banco.
 *
 * Até 04/09/2026 eram 28 `groupBy` do Prisma num `Promise.all`. Paralelo no
 * código, fila no banco: o pool de uma função da Vercel tem 5 conexões
 * (lib/prisma.ts), então as 28 rodavam em seis ondas, cada onda pagando a
 * viagem até o Neon — e a tela inicial do grupo, que soma a isto as 21 de
 * `empresasComRegistro`, levava de 2 a 5 segundos para aparecer (medido em
 * produção, com sessão de verdade). Cada consulta é barata — tabelas de
 * centenas de linhas; o que custava era a QUANTIDADE de viagens.
 *
 * Agora é um `UNION ALL` de subconsultas, uma por pendência, devolvendo
 * (chave, empresaId, n). O nome de cada pendência entra na SQL a partir da
 * CHAVE do objeto: `Record<keyof Pendencias, …>` obriga a lista a ter as 27
 * e recusa chave escrita errado — que é o defeito que uma string solta na
 * SQL permitiria: cartão zerado sem erro nenhum, o pior tipo de erro desta
 * tela.
 *
 * As regras são as dos `where` antigos, traduzidas uma a uma. Duas delas
 * continuam existindo TAMBÉM em Prisma, porque a lista e o alerta filtram
 * com elas:
 *   - `cadastrosIncompletos` espelha CADASTRO_INCOMPLETO_WHERE (a lista
 *     ?lacuna=cadastro);
 *   - `planosAcaoVencidos` espelha planoAcaoVencidoWhere (o alerta AL09).
 * Quem mudar uma muda a outra; scripts/smoke-pendencias.ts exercita as duas.
 *
 * Convenções da SQL:
 *   - `alvo` é a CTE com os CNPJs pedidos (montada em `contarPorEmpresa`), e
 *     toda subconsulta filtra por ela; a tabela principal é sempre `x`;
 *   - `rh.` na frente de toda tabela — SQL crua não herda o schema do Prisma;
 *   - data viaja como texto ISO com `::timestamp`: as colunas são `timestamp`
 *     sem fuso, gravadas em UTC pelo Prisma, e nessa conversão o `Z` do ISO
 *     é ignorado — sobra a mesma meia-noite UTC de `hojeUTC()`.
 */
const ESCOPO = Prisma.sql`x."empresaId" IN (SELECT id FROM alvo)`;
const COLABORADOR_ATIVO = Prisma.sql`EXISTS (SELECT 1 FROM rh."Colaborador" c WHERE c.id = x."colaboradorId" AND c.ativo)`;
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

function subconsultasDePendencias(hoje: Date): Record<keyof Pendencias, readonly Prisma.Sql[]> {
  const hojeSql = ts(hoje);
  const limite = ts(somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO));
  const umAnoAtras = ts(somarDiasUTC(hoje, -365));
  const seisMesesAtras = ts(somarDiasUTC(hoje, -180));
  const corte = ts(PRIMEIRO_DESLIGAMENTO_COBRADO);
  const contratosPorPrazo = Prisma.join([...CONTRATOS_POR_PRAZO]);

  return {
    // Férias e ausências somam no mesmo número — por isso são duas subconsultas
    // com a mesma chave, e a leitura faz `+=` (ver pendenciasPorEmpresa).
    aprovacoes: [
      Prisma.sql`FROM rh."SolicitacaoFerias" x WHERE ${ESCOPO} AND x.status = 'PENDENTE'`,
      Prisma.sql`FROM rh."Ausencia" x WHERE ${ESCOPO} AND x.status = 'PENDENTE'`,
    ],
    // Enviado pelo colaborador no portal e ainda não conferido pelo RH.
    documentosAConferir: [
      Prisma.sql`FROM rh."DocumentoColaborador" x WHERE ${ESCOPO} AND x.origem = 'COLABORADOR' AND x."conferidoEm" IS NULL`,
    ],
    asoVencendo: [
      Prisma.sql`FROM rh."ExameOcupacional" x WHERE ${ESCOPO} AND x."validoAte" IS NOT NULL AND x."validoAte" <= ${limite} AND ${COLABORADOR_ATIVO}`,
    ],
    certificadosVencendo: [
      Prisma.sql`FROM rh."CertificadoNR" x WHERE ${ESCOPO} AND x."validoAte" IS NOT NULL AND x."validoAte" <= ${limite} AND ${COLABORADOR_ATIVO}`,
    ],
    catPendente: [Prisma.sql`FROM rh."AcidenteTrabalho" x WHERE ${ESCOPO} AND NOT x."catEmitida"`],
    integracoesAtrasadas: [
      Prisma.sql`FROM rh."ChecklistIntegracao" x WHERE ${ESCOPO} AND NOT x.concluido AND x.prazo IS NOT NULL AND x.prazo < ${hojeSql} AND ${COLABORADOR_ATIVO}`,
    ],
    epiVencido: [
      Prisma.sql`FROM rh."EntregaEPI" x WHERE ${ESCOPO} AND x."validoAte" IS NOT NULL AND x."validoAte" < ${hojeSql} AND ${COLABORADOR_ATIVO}`,
    ],
    // Férias vencidas: 12+ meses de casa sem NENHUMA férias aprovada que
    // tenha começado no último ano. Sem dataAdmissao a pessoa fica de fora —
    // preenchê-la é lacuna da tela inicial, não pendência daqui.
    feriasVencidas: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND x."dataAdmissao" IS NOT NULL AND x."dataAdmissao" < ${umAnoAtras} AND NOT EXISTS (SELECT 1 FROM rh."SolicitacaoFerias" f WHERE f."colaboradorId" = x.id AND f.status = 'APROVADA' AND f."dataInicio" >= ${umAnoAtras})`,
    ],
    // Aviso prévio: desligamento registrado para os próximos 7 dias e a
    // pessoa ainda ativa — a saída está marcada, o processo tem que andar.
    avisoPrevio: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND x."dataDesligamento" >= ${hojeSql} AND x."dataDesligamento" <= ${ts(somarDiasUTC(hoje, 7))}`,
    ],
    // Desligado com item de offboarding em aberto (crachá, notebook, acesso…).
    // Só saída a partir do corte (PRIMEIRO_DESLIGAMENTO_COBRADO): item criado
    // para um desligamento histórico continua visível na tela e na ficha,
    // mas não cobra — mesma decisão das duas pendências irmãs de desligamento.
    desligamentosIncompletos: [
      Prisma.sql`FROM rh."ChecklistDesligamento" x WHERE ${ESCOPO} AND NOT x.concluido AND EXISTS (SELECT 1 FROM rh."Colaborador" c WHERE c.id = x."colaboradorId" AND NOT c.ativo AND c."dataDesligamento" >= ${corte})`,
    ],
    // Ciclo de avaliação com a janela fechada e ainda aberto — falta cobrar
    // quem não avaliou e encerrar. Conta o CICLO, não as avaliações pendentes
    // dentro dele (ver o comentário do tipo).
    ciclosAvaliacaoAEncerrar: [
      Prisma.sql`FROM rh."CicloAvaliacao" x WHERE ${ESCOPO} AND NOT x.encerrado AND x."dataFim" < ${hojeSql}`,
    ],
    // Pesquisa ainda ACTIVE — aberta para os colaboradores responderem e
    // esperando o RH encerrar. Só ACTIVE: DRAFT não chegou a ninguém e
    // FINISHED/ARCHIVED já foi fechada.
    //
    // Agrupa pelo `empresaId` da Pesquisa, que é o CNPJ onde ela nasceu (o
    // vínculo real é com a MARCA, ver o model). Como quem chama passa os
    // CNPJs da marca inteira, a pesquisa entra uma vez só no total — não
    // multiplica por CNPJ irmão.
    pesquisasAbertas: [Prisma.sql`FROM rh."Pesquisa" x WHERE ${ESCOPO} AND x.status = 'ACTIVE'`],
    // Ficha sem NENHUMA gravação há 6+ meses. updatedAt é proxy — qualquer
    // edição conta — mas é o campo que existe.
    fichasDesatualizadas: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND x."updatedAt" < ${seisMesesAtras}`,
    ],
    // Contrato por prazo determinado chegando ao fim. Inclui o que JÁ venceu
    // (sem piso na data): passar do termo é justamente o que transforma o
    // contrato em indeterminado, então um vencimento esquecido tem que
    // continuar cobrando, não sumir da tela por ter passado.
    contratosVencendo: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND x."tipoContrato" IN (${contratosPorPrazo}) AND x."dataFimContrato" IS NOT NULL AND x."dataFimContrato" <= ${limite}`,
    ],
    // Horas extras da competência ABERTA, somadas por pessoa. O teto do art.
    // 59 é individual: agregar por empresa antes de comparar diluiria quem
    // estourou sozinho no meio de um time que não fez hora nenhuma. Soma
    // nula (lançamento em valor, não em horas) nunca passa do teto — em SQL,
    // `NULL > 44` é falso, o mesmo `?? 0` de antes.
    horasExtrasExcedidas: [
      Prisma.sql`FROM (SELECT ef."empresaId", ef."colaboradorId", sum(ef.quantidade) AS horas FROM rh."EventoFolha" ef WHERE ef."empresaId" IN (SELECT id FROM alvo) AND ef.tipo IN (${Prisma.join([...RUBRICAS_HORA_EXTRA])}) AND EXISTS (SELECT 1 FROM rh."CompetenciaFolha" cf WHERE cf.id = ef."competenciaId" AND cf.status = 'ABERTA') GROUP BY 1, 2) x WHERE x.horas > ${LIMITE_HORAS_EXTRAS_MES}::float8`,
    ],
    // Dependente declarado para IRRF sem CPF. A Receita exige CPF de todo
    // dependente, de qualquer idade (IN RFB 1.760/2017): sem ele a dedução
    // cai na malha e o desconto vira diferença a pagar pelo colaborador.
    // Conta PESSOAS, não dependentes — é o colaborador que o RH vai chamar.
    dependentesSemCpf: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND EXISTS (SELECT 1 FROM rh."Dependente" d WHERE d."colaboradorId" = x.id AND d.irrf AND d.cpf IS NULL)`,
    ],
    // Atestado JÁ APROVADO e abonado sem o papel anexado: a falta foi
    // perdoada e não há documento que sustente o abono numa fiscalização.
    //
    // O filtro por APROVADA não é detalhe — é o que impede contar duas vezes.
    // Atestado ainda PENDENTE já entra em `aprovacoes`; sem este recorte, o
    // mesmo item somaria nos dois contadores e inflaria o total da tela.
    atestadosSemDocumento: [
      Prisma.sql`FROM rh."Ausencia" x WHERE ${ESCOPO} AND x.tipo = 'ATESTADO' AND x.status = 'APROVADA' AND x.abonada AND x."arquivoId" IS NULL`,
    ],
    // Ativo sem Telegram vinculado — null OU "": mesma condição da lacuna
    // (lib/dashboard.ts) e da lista (?lacuna=telegram), para os três números
    // baterem sempre.
    semTelegram: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND (x."telegramChatId" IS NULL OR x."telegramChatId" = '')`,
    ],
    // Ficha com campo essencial em branco — a tradução de
    // CADASTRO_INCOMPLETO_WHERE, campo a campo (ver o cabeçalho).
    cadastrosIncompletos: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND (x.cpf IS NULL OR x."dataAdmissao" IS NULL OR (x.email IS NULL AND x.telefone IS NULL))`,
    ],
    // Nome, não FK: "sem setor" no sistema é estar no setor "Não definido"
    // (setorId é obrigatório no schema). Mesma condição da lacuna da home.
    // "Demitidos" entrou em 27/08/2026: é o arquivo oculto dos desligados —
    // um ATIVO ali é tão sem-setor quanto no "Não definido". Sem diferenciar
    // caixa, como o `mode: "insensitive"` de antes.
    semSetor: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND EXISTS (SELECT 1 FROM rh."Setor" s WHERE s.id = x."setorId" AND lower(s.nome) IN ('não definido', 'demitidos'))`,
    ],
    // ---- as oito de 19/08/2026 (ver os comentários no tipo Pendencias) ----
    // Ajuste de ponto esperando decisão. Mesma consulta que a tela de
    // Aprovações faz desde 11/08/2026 — se as duas divergirem, o cartão diz
    // um número e a fila mostra outro.
    ajustesPontoPendentes: [Prisma.sql`FROM rh."TratamentoPonto" x WHERE ${ESCOPO} AND x.status = 'PENDENTE'`],
    // "Fale com o RH" sem resposta. Sem filtro de `ativo`: a pergunta de
    // quem já saiu continua sendo uma pergunta sem resposta, e a tela
    // /mensagens também a mostra.
    mensagensSemResposta: [Prisma.sql`FROM rh."MensagemPortal" x WHERE ${ESCOPO} AND x."respondidaEm" IS NULL`],
    // Entrega sem confirmação de quem recebeu. Devolvida sai da conta —
    // não há mais o que confirmar.
    entregasNaoConfirmadas: [
      Prisma.sql`FROM rh."EntregaAoColaborador" x WHERE ${ESCOPO} AND x."confirmadoEm" IS NULL AND x."devolvidoEm" IS NULL AND ${COLABORADOR_ATIVO}`,
    ],
    // Advertência/suspensão sem assinatura colhida.
    disciplinarSemAssinatura: [
      Prisma.sql`FROM rh."OcorrenciaDisciplinar" x WHERE ${ESCOPO} AND x."statusAssinatura" = 'PENDENTE' AND ${COLABORADOR_ATIVO}`,
    ],
    // Plano de ação vencido — a tradução de planoAcaoVencidoWhere, a mesma
    // régua do alerta AL09 (ver o cabeçalho e o comentário do helper).
    planosAcaoVencidos: [
      Prisma.sql`FROM rh."PlanoAcao" x WHERE ${ESCOPO} AND x.status NOT IN ('CONCLUIDO', 'CANCELADO') AND x.prazo < ${hojeSql}`,
    ],
    // Desligado sem nenhum item de offboarding criado. Mesma regra do resumo
    // da tela /desligamentos (campo `semChecklist`), dispensa inclusive.
    // `>=` corte: desligamento até 15/08/2026 é anterior ao uso do sistema
    // e não cobra (decisão do CEO de 20/08 — ver a constante). O corte por
    // DATA substitui as dispensas em massa por migration (20260807200000 e
    // 20260820120000), que dependiam de adivinhar o histórico pelo motivo em
    // branco ou pelo createdAt — e ainda deixavam 80 casos passar.
    desligamentosSemChecklist: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x."dataDesligamento" >= ${corte} AND NOT x."checklistDispensado" AND NOT EXISTS (SELECT 1 FROM rh."ChecklistDesligamento" cd WHERE cd."colaboradorId" = x.id)`,
    ],
    // Desligado sem entrevista de saída. Par da anterior, mesma dispensa e
    // mesmo corte — mas SÓ saída que já aconteceu (`<= hoje`): quem está em
    // aviso prévio ainda trabalha, e a entrevista de saída dele não tem como
    // existir. O checklist é diferente de propósito (precisa existir ANTES da
    // saída); a mesma régua vale no resumo da tela /desligamentos.
    desligamentosSemEntrevista: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x."dataDesligamento" >= ${corte} AND x."dataDesligamento" <= ${hojeSql} AND NOT x."checklistDispensado" AND NOT EXISTS (SELECT 1 FROM rh."EntrevistaDesligamento" e WHERE e."colaboradorId" = x.id)`,
    ],
    // Sinal ainda sem triagem. `tipo` exclui PLANO_VENCIDO para o mesmo plano
    // não contar duas vezes (ver o comentário no tipo). Sinal de GRUPO/MARCA
    // tem `empresaId` nulo e fica fora por construção — a tela de Pendências
    // é por empresa, e um sinal de grupo não tem a quem ser cobrado aqui. Ele
    // continua visível na Central de Sinais, que já o mostra para todo mundo.
    sinaisAbertos: [
      Prisma.sql`FROM rh."Sinal" x WHERE ${ESCOPO} AND x.status = 'ABERTO' AND x.gravidade IN ('CRITICA', 'ALTA') AND x.tipo <> 'PLANO_VENCIDO'`,
    ],
  };
}

/**
 * Executa as subconsultas de uma vez: `WITH alvo(id) AS (VALUES …)` com os
 * CNPJs pedidos, e um `UNION ALL` de `SELECT chave, empresaId, count(*)` por
 * subconsulta. Chave e CNPJ que não têm linha nenhuma não voltam — quem lê
 * parte de um mapa já zerado.
 */
async function contarPorEmpresa<K extends string>(
  cliente: Cliente,
  empresaIds: string[],
  subconsultas: Record<K, readonly Prisma.Sql[]>,
): Promise<{ chave: K; empresaId: string; n: number }[]> {
  const alvo = Prisma.join(empresaIds.map((id) => Prisma.sql`(${id}::text)`));
  const partes = (Object.entries(subconsultas) as [K, readonly Prisma.Sql[]][]).flatMap(
    ([chave, fragmentos]) =>
      fragmentos.map(
        (fragmento) =>
          Prisma.sql`SELECT ${chave}::text AS chave, x."empresaId" AS "empresaId", count(*)::int AS n ${fragmento} GROUP BY x."empresaId"`,
      ),
  );
  return cliente.$queryRaw<{ chave: K; empresaId: string; n: number }[]>(
    Prisma.sql`WITH alvo(id) AS (VALUES ${alvo}) ${Prisma.join(partes, " UNION ALL ")}`,
  );
}

/**
 * As pendências de várias empresas de uma vez, já separadas por empresa.
 *
 * Uma ida ao banco, independente de quantas empresas entrarem (ver
 * `subconsultasDePendencias`). A tela inicial do grupo já chamou
 * `pendenciasDaEmpresa([id])` dentro de um laço — 8 queries POR empresa —,
 * depois 28 `groupBy` em paralelo; agora é uma consulta.
 *
 * Empresa sem nenhuma pendência não volta do banco; por isso o mapa já nasce
 * com todas as chaves zeradas.
 */
// `cliente` existe para o smoke poder rodar dentro de uma transação com
// rollback, como em lib/regua-cobranca.ts. Produção nunca passa nada e usa o
// prisma global; sem isto, um teste que cria o dado e chama a função leria
// fora da transação e não veria o que acabou de criar.
export async function pendenciasPorEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Map<string, Pendencias>> {
  const mapa = new Map<string, Pendencias>(empresaIds.map((id) => [id, zeradas()]));
  if (empresaIds.length === 0) return mapa;

  const linhas = await contarPorEmpresa(cliente, empresaIds, subconsultasDePendencias(hojeUTC()));

  // `+=`, não `=`: `aprovacoes` chega em duas linhas por CNPJ (férias e
  // ausências somam no mesmo número). As demais chegam uma vez.
  for (const linha of linhas) {
    const p = mapa.get(linha.empresaId);
    if (p) p[linha.chave] += linha.n;
  }

  return mapa;
}

export type PesquisaAberta = {
  id: string;
  titulo: string;
  /** Dias desde que abriu para os colaboradores responderem. */
  diasAberta: number;
  respostas: number;
};

/**
 * As pesquisas ainda ACTIVE, com há quantos dias cada uma está aberta.
 *
 * O cartão de pendência mostra só a contagem; quem vai DECIDIR encerrar precisa
 * do resto — uma pesquisa aberta há 5 dias ainda está colhendo resposta, uma há
 * 60 foi esquecida. Como responder é opcional (foi por isso que "convite sem
 * resposta" deixou de ser pendência em 06/08/2026), o que orienta a decisão é
 * tempo aberto + quanta resposta já entrou, nunca quem falta responder.
 */
export async function pesquisasAbertasDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<PesquisaAberta[]> {
  if (empresaIds.length === 0) return [];
  const hoje = hojeUTC();

  const abertas = await cliente.pesquisa.findMany({
    where: { empresaId: { in: empresaIds }, status: "ACTIVE" },
    select: {
      id: true,
      titulo: true,
      iniciadaEm: true,
      createdAt: true,
      _count: { select: { respostas: true } },
    },
  });

  return (
    abertas
      .map((p) => ({
        id: p.id,
        titulo: p.titulo,
        // `iniciadaEm` é gravada ao ativar; `createdAt` é a rede de segurança
        // para a pesquisa que já nasce ACTIVE — as campanhas por evento de
        // lib/pesquisa-ciclo.ts fazem exatamente isso.
        diasAberta: Math.max(0, diferencaEmDiasUTC(hoje, p.iniciadaEm ?? p.createdAt)),
        respostas: p._count.respostas,
      }))
      // Mais tempo aberta primeiro: é a que o RH precisa decidir antes.
      .sort((a, b) => b.diasAberta - a.diasAberta)
  );
}

export type CicloAEncerrar = {
  id: string;
  nome: string;
  /** Dias desde que a janela do ciclo fechou. */
  diasVencido: number;
  /** Avaliações ainda PENDENTES dentro dele — contexto da cobrança, não pendência. */
  avaliacoesPendentes: number;
};

/**
 * Os ciclos de avaliação vencidos e não encerrados, com o tamanho do atraso e
 * quantas avaliações ainda faltam. O cartão mostra só a contagem de ciclos;
 * quem vai agir precisa saber QUAL ciclo e o tamanho da cobrança — o número
 * que era o próprio contador até 10/08/2026 vira contexto aqui.
 */
export async function ciclosAEncerrarDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<CicloAEncerrar[]> {
  if (empresaIds.length === 0) return [];
  const hoje = hojeUTC();

  const ciclos = await cliente.cicloAvaliacao.findMany({
    where: { empresaId: { in: empresaIds }, encerrado: false, dataFim: { lt: hoje } },
    select: {
      id: true,
      nome: true,
      dataFim: true,
      _count: { select: { avaliacoes: { where: { status: "PENDENTE" } } } },
    },
  });

  return ciclos
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      diasVencido: Math.max(0, diferencaEmDiasUTC(hoje, c.dataFim)),
      avaliacoesPendentes: c._count.avaliacoes,
    }))
    // Mais atrasado primeiro — é o que o RH precisa fechar antes.
    .sort((a, b) => b.diasVencido - a.diasVencido);
}

/**
 * Onde ver se o módulo de cada pendência já foi usado — qualquer linha na
 * tabela que a pendência lê, sem os filtros da pendência.
 *
 * As situações que dependem só de Colaborador (aprovações, férias vencidas,
 * aviso prévio, ficha desatualizada, sem Telegram, sem setor) ficam de fora:
 * sempre há base para calcular. `Partial<Record<keyof Pendencias, …>>` é a
 * prova de tipo — chave que não é pendência não compila.
 *
 * `desligamentosSemChecklist` e `desligamentosSemEntrevista` compartilham a
 * base: quem nunca desligou ninguém não está com o offboarding "em dia", está
 * sem o módulo.
 */
function subconsultasDeRegistro() {
  const colaboradorDesligado = Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x."dataDesligamento" IS NOT NULL`;
  return {
    asoVencendo: [Prisma.sql`FROM rh."ExameOcupacional" x WHERE ${ESCOPO}`],
    certificadosVencendo: [Prisma.sql`FROM rh."CertificadoNR" x WHERE ${ESCOPO}`],
    epiVencido: [Prisma.sql`FROM rh."EntregaEPI" x WHERE ${ESCOPO}`],
    catPendente: [Prisma.sql`FROM rh."AcidenteTrabalho" x WHERE ${ESCOPO}`],
    integracoesAtrasadas: [Prisma.sql`FROM rh."ChecklistIntegracao" x WHERE ${ESCOPO}`],
    desligamentosIncompletos: [Prisma.sql`FROM rh."ChecklistDesligamento" x WHERE ${ESCOPO}`],
    documentosAConferir: [Prisma.sql`FROM rh."DocumentoColaborador" x WHERE ${ESCOPO}`],
    // Ciclo, não avaliação: é o que a pendência conta desde 10/08/2026, e uma
    // empresa que criou ciclo mas ainda não gerou avaliação já usa o módulo.
    ciclosAvaliacaoAEncerrar: [Prisma.sql`FROM rh."CicloAvaliacao" x WHERE ${ESCOPO}`],
    atestadosSemDocumento: [Prisma.sql`FROM rh."Ausencia" x WHERE ${ESCOPO}`],
    horasExtrasExcedidas: [Prisma.sql`FROM rh."EventoFolha" x WHERE ${ESCOPO}`],
    // Dependente não tem empresaId — só colaboradorId. A pergunta vira "quais
    // empresas têm alguém com dependente".
    dependentesSemCpf: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND EXISTS (SELECT 1 FROM rh."Dependente" d WHERE d."colaboradorId" = x.id)`,
    ],
    // Contrato é diferente dos outros: a tabela é Colaborador, que nunca está
    // vazia. O que falta é a classificação — ninguém com contrato por prazo
    // marcado significa que o RH ainda não preencheu `tipoContrato`, e a
    // pendência não tem como existir.
    contratosVencendo: [
      Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo AND x."tipoContrato" IN (${Prisma.join([...CONTRATOS_POR_PRAZO])})`,
    ],
    // Qualquer pesquisa, em qualquer status: quem nunca criou uma não está com
    // as pesquisas "em dia", está sem o módulo. Sem isto, marca que nunca abriu
    // pesquisa apareceria no verde junto de quem encerra tudo em prazo.
    pesquisasAbertas: [Prisma.sql`FROM rh."Pesquisa" x WHERE ${ESCOPO}`],
    // Qualquer colaborador ativo: se não tem ninguém, o módulo de cadastros
    // nunca foi aberto. Com isto a verificação de "tem registro" e "precisa de
    // ação" ficam alinhadas para cadastrosIncompletos.
    cadastrosIncompletos: [Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x.ativo`],
    // ---- as sete de 19/08/2026 ----
    // Ponto: a pergunta é se o módulo é USADO, não se há tratamento pendente —
    // empresa que bate ponto e não tem nenhum ajuste em aberto está em dia de
    // verdade; empresa que nunca bateu não tem o que avaliar.
    //
    // A prova é `pontoLiberado` no Colaborador, não a tabela RegistroPonto:
    // esta consulta roda na primeira tela depois do login, para todas as
    // empresas de uma vez, e RegistroPonto cresce por batida (quatro por
    // pessoa por dia) — varrê-la aqui custaria mais que todas as outras
    // somadas. Colaborador tem centenas de linhas e responde a mesma
    // pergunta: sem ninguém com ponto liberado não existe ajuste possível.
    ajustesPontoPendentes: [Prisma.sql`FROM rh."Colaborador" x WHERE ${ESCOPO} AND x."pontoLiberado"`],
    mensagensSemResposta: [Prisma.sql`FROM rh."MensagemPortal" x WHERE ${ESCOPO}`],
    entregasNaoConfirmadas: [Prisma.sql`FROM rh."EntregaAoColaborador" x WHERE ${ESCOPO}`],
    disciplinarSemAssinatura: [Prisma.sql`FROM rh."OcorrenciaDisciplinar" x WHERE ${ESCOPO}`],
    planosAcaoVencidos: [Prisma.sql`FROM rh."PlanoAcao" x WHERE ${ESCOPO}`],
    desligamentosSemChecklist: [colaboradorDesligado],
    desligamentosSemEntrevista: [colaboradorDesligado],
    // Qualquer sinal já detectado nesta empresa, em qualquer status ou
    // gravidade: quem nunca teve sinal nenhum não está "sem sinais críticos",
    // está sem histórico para o zero significar alguma coisa. Sinal de
    // GRUPO/MARCA (empresaId nulo) fica fora por construção.
    sinaisAbertos: [Prisma.sql`FROM rh."Sinal" x WHERE ${ESCOPO}`],
  } satisfies Partial<Record<keyof Pendencias, readonly Prisma.Sql[]>>;
}

/**
 * Os módulos que não têm NENHUM registro nestas empresas.
 *
 * Existe porque zero é ambíguo na tela de pendências e os dois significados são
 * opostos: "nenhuma CAT em aberto" pode ser a empresa em dia ou o módulo de
 * acidentes nunca ter sido aberto. Em 04/08/2026 era o segundo caso em SST,
 * onboarding, offboarding, folha, ausências e dependentes — seis áreas zeradas
 * por falta de uso, exibidas sob um "Tudo em dia" verde. Para um prazo como o
 * da CAT (1 dia útil), dizer "em dia" sem base é pior do que não dizer nada.
 *
 * Devolve por EMPRESA porque as duas telas fazem a mesma pergunta em escopos
 * diferentes: a da empresa quer a marca inteira, a do grupo quer marca a marca.
 *
 * Uma ida ao banco, quantas marcas forem (eram 21 `groupBy`; ver o cabeçalho
 * de `subconsultasDePendencias`). O mapa nasce com TODAS as chaves da lista,
 * cada uma com conjunto vazio: chave presente e vazia é o que
 * `semRegistroNoEscopo` lê como "módulo nunca aberto" — chave ausente seria
 * "sempre há base", e as duas leituras não podem se confundir.
 */
export async function empresasComRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Map<keyof Pendencias, Set<string>>> {
  const mapa = new Map<keyof Pendencias, Set<string>>();
  if (empresaIds.length === 0) return mapa;

  const registros = subconsultasDeRegistro();
  for (const chave of Object.keys(registros) as (keyof typeof registros)[]) mapa.set(chave, new Set());

  const linhas = await contarPorEmpresa(cliente, empresaIds, registros);
  for (const linha of linhas) mapa.get(linha.chave)?.add(linha.empresaId);
  return mapa;
}

/**
 * As situações que, num escopo, não têm NENHUM registro — a leitura de
 * `empresasComRegistro` para um conjunto de CNPJs.
 */
export function semRegistroNoEscopo(
  comRegistro: Map<keyof Pendencias, Set<string>>,
  empresaIds: string[],
): Set<keyof Pendencias> {
  const vazios = new Set<keyof Pendencias>();
  for (const [chave, empresas] of comRegistro) {
    if (!empresaIds.some((id) => empresas.has(id))) vazios.add(chave);
  }
  return vazios;
}

export async function modulosSemRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Set<keyof Pendencias>> {
  if (empresaIds.length === 0) return new Set();
  return semRegistroNoEscopo(await empresasComRegistro(empresaIds, cliente), empresaIds);
}

/**
 * O que exige ação numa empresa. Usado tanto na tela inicial do grupo quanto
 * na da empresa — uma função só para os dois lugares nunca discordarem sobre
 * o que conta como pendência.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts): o RH cobra a pendência
// de todo mundo no mesmo lugar, não CNPJ a CNPJ.
export async function pendenciasDaEmpresa(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Pendencias> {
  const porEmpresa = await pendenciasPorEmpresa(empresaIds, cliente);

  const total = zeradas();
  // Soma genérica: com 27 contadores, esquecer um campo aqui viraria um número
  // silenciosamente menor na tela — foi assim com os 7 originais escritos à mão.
  for (const p of porEmpresa.values()) {
    for (const chave of Object.keys(total) as (keyof Pendencias)[]) {
      total[chave] += p[chave];
    }
  }
  return total;
}
