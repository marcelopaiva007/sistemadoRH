import { prisma, type Cliente } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { DIAS_ALERTA_VENCIMENTO, CONTRATOS_POR_PRAZO } from "@/lib/constants-dp";
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
   */
  desligamentosSemChecklist: number;

  /**
   * Desligado sem entrevista de saída registrada. Mesmo par da anterior: a tela
   * /desligamentos já conta (`semEntrevista`), com a mesma dispensa valendo.
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
  semTelegram: "Sem Telegram vinculado",
  ajustesPontoPendentes: "Ajuste de ponto a decidir",
  mensagensSemResposta: "Mensagem do portal sem resposta",
  entregasNaoConfirmadas: "Entrega sem confirmação",
  disciplinarSemAssinatura: "Medida disciplinar sem assinatura",
  planosAcaoVencidos: "Plano de ação vencido",
  desligamentosSemChecklist: "Desligado sem checklist de saída",
  desligamentosSemEntrevista: "Desligado sem entrevista de saída",
  sinaisAbertos: "Sinal sem triagem",
};

/**
 * As 27 pendências separadas por NATUREZA DA AÇÃO.
 *
 * POR QUE ISTO EXISTE. A tela inicial mostrava as 19 somadas num número só. O
 * efeito ficou evidente em 12/08/2026: "163 cadastros incompletos" e "6
 * documentos aguardando conferência" moravam dentro do mesmo total — e o
 * segundo, que é gente esperando resposta do RH hoje, sumia dentro do
 * primeiro, que não tem data fatal nenhuma. Número que mistura urgência com
 * ruído não é fila de trabalho; é um número grande que se aprende a ignorar.
 *
 * A régua de cada grupo é UMA pergunta:
 *   DECIDIR  — "tem alguém esperando uma resposta minha?" (o RH é o gargalo)
 *   PRAZO    — "tem data correndo contra?" (a data é o gargalo)
 *   CADASTRO — "falta dado?" (nada trava hoje; é qualidade de base)
 *
 * `satisfies` com a lista de chaves obriga o TypeScript a cobrar: pendência
 * nova que não entre em exatamente um grupo não compila. Sem isso, a próxima
 * pendência entraria no total e não apareceria em grupo nenhum — que é
 * justamente o tipo de omissão silenciosa que esta separação veio corrigir.
 */
export const PENDENCIAS_DECIDIR = [
  "aprovacoes",
  "documentosAConferir",
  // CAT tem prazo legal de 1 dia útil (Lei 8.213/91, art. 22) — é decisão que
  // não espera, não "acompanhamento".
  "catPendente",
  // As três de 19/08/2026: em todas há uma PESSOA do outro lado esperando o
  // RH — quem pediu ajuste de ponto, quem escreveu pelo portal e quem foi
  // advertido (a assinatura é do colaborador, mas colhê-la é diligência do
  // RH). É a definição do grupo.
  //
  // `entregasNaoConfirmadas` ENTROU aqui em 19/08 e SAIU em 20/08: confirmar o
  // recebimento é ação do COLABORADOR no portal, não decisão do RH — um lote
  // de 171 uniformes registrado de uma vez fazia o "aguardando você" da home e
  // do e-mail diário saltar +171 sem nenhuma ação do RH capaz de baixar o
  // número. Foi para PRAZO: a prova da entrega envelhece como um vencimento.
  "ajustesPontoPendentes",
  "mensagensSemResposta",
  "disciplinarSemAssinatura",
] as const;

export const PENDENCIAS_PRAZO = [
  "asoVencendo",
  "certificadosVencendo",
  "epiVencido",
  "feriasVencidas",
  "contratosVencendo",
  "avisoPrevio",
  "integracoesAtrasadas",
  "desligamentosIncompletos",
  "ciclosAvaliacaoAEncerrar",
  "horasExtrasExcedidas",
  // 19/08/2026. `planosAcaoVencidos` e `desligamentosSemEntrevista` têm data
  // que já passou; `desligamentosSemChecklist` cobra também quem está em aviso
  // prévio (a saída está marcada e o checklist já precisa existir);
  // `sinaisAbertos` entra aqui e não em DECIDIR porque o sinal carrega prazo e
  // gravidade próprios e ninguém, pessoalmente, está do outro lado esperando —
  // é condição detectada correndo contra o relógio. `entregasNaoConfirmadas`
  // veio de DECIDIR em 20/08 (ver o comentário lá em cima).
  "planosAcaoVencidos",
  "desligamentosSemChecklist",
  "desligamentosSemEntrevista",
  "sinaisAbertos",
  "entregasNaoConfirmadas",
] as const;

export const PENDENCIAS_CADASTRO = [
  "cadastrosIncompletos",
  "fichasDesatualizadas",
  "dependentesSemCpf",
  "atestadosSemDocumento",
  "semTelegram",
  "pesquisasAbertas",
] as const;

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
  ajustesPontoPendentes: 0,
  mensagensSemResposta: 0,
  entregasNaoConfirmadas: 0,
  disciplinarSemAssinatura: 0,
  planosAcaoVencidos: 0,
  desligamentosSemChecklist: 0,
  desligamentosSemEntrevista: 0,
  sinaisAbertos: 0,
});

type LinhaAgrupada = { empresaId: string; _count?: { _all?: number } };

/**
 * `Promise.all` CHAVEADO: espera um objeto de promises preservando o tipo de
 * cada uma. Existe por causa das listas posicionais que este arquivo tinha —
 * 28 consultas de tipos quase todos idênticos, destruturadas de um array
 * pareado só pela ordem: uma transposição (num merge, num rebase) compilava
 * limpa e o número de um cartão saía no do vizinho. Com chave, é o TypeScript
 * que faz o pareamento; as consultas continuam disparando juntas (a promise
 * nasce na construção do objeto).
 */
async function todas<T extends Record<string, Promise<unknown>>>(
  consultas: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const pares = await Promise.all(
    Object.entries(consultas).map(async ([chave, promessa]) => [chave, await promessa] as const),
  );
  return Object.fromEntries(pares) as { [K in keyof T]: Awaited<T[K]> };
}

/**
 * As pendências de várias empresas de uma vez, já separadas por empresa.
 *
 * São 28 queries agregadas, independente de quantas empresas entrarem: o
 * `groupBy` devolve a contagem por `empresaId` numa tacada. A tela inicial do
 * grupo antes chamava `pendenciasDaEmpresa([id])` dentro de um laço, o que dava
 * 8 queries POR empresa — com os 11 CNPJs do grupo, quase 90 idas ao banco só
 * para montar os cartões.
 *
 * Empresa sem nenhuma pendência não volta no `groupBy`; por isso o mapa já
 * nasce com todas as chaves zeradas.
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

  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  const umAnoAtras = somarDiasUTC(hoje, -365);
  const seisMesesAtras = somarDiasUTC(hoje, -180);

  const {
    feriasPendentes, ausenciasPendentes, documentosAConferir, asoVencendo,
    certificadosVencendo, catPendente, integracoesAtrasadas, epiVencido,
    feriasVencidas, avisoPrevio, desligamentosIncompletos, ciclosAvaliacaoAEncerrar,
    pesquisasAbertas, fichasDesatualizadas,
    contratosVencendo, dependentesSemCpf, atestadosSemDocumento, horasExtras,
    semTelegram, cadastrosIncompletos,
    ajustesPontoPendentes, mensagensSemResposta, entregasNaoConfirmadas,
    disciplinarSemAssinatura, planosAcaoVencidos, desligamentosSemChecklist,
    desligamentosSemEntrevista, sinaisAbertosPorEmpresa,
    // Chave em cada consulta, não duas listas posicionais — ver `todas`.
  } = await todas({
      feriasPendentes: cliente.solicitacaoFerias.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      ausenciasPendentes: cliente.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      // Enviado pelo colaborador no portal e ainda não conferido pelo RH.
      documentosAConferir: cliente.documentoColaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      }),
      asoVencendo: cliente.exameOcupacional.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      certificadosVencendo: cliente.certificadoNR.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      catPendente: cliente.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId, catEmitida: false } }),
      integracoesAtrasadas: cliente.checklistIntegracao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, prazo: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      epiVencido: cliente.entregaEPI.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      // Férias vencidas: 12+ meses de casa sem NENHUMA férias aprovada que
      // tenha começado no último ano. Sem dataAdmissao a pessoa fica de fora —
      // preenchê-la é lacuna da tela inicial, não pendência daqui.
      feriasVencidas: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          dataAdmissao: { not: null, lt: umAnoAtras },
          ferias: { none: { status: "APROVADA", dataInicio: { gte: umAnoAtras } } },
        },
      }),
      // Aviso prévio: desligamento registrado para os próximos 7 dias e a
      // pessoa ainda ativa — a saída está marcada, o processo tem que andar.
      avisoPrevio: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dataDesligamento: { gte: hoje, lte: somarDiasUTC(hoje, 7) } },
      }),
      // Desligado com item de offboarding em aberto (crachá, notebook, acesso…).
      desligamentosIncompletos: cliente.checklistDesligamento.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, colaborador: { ativo: false } },
      }),
      // Ciclo de avaliação com a janela fechada e ainda aberto — falta cobrar
      // quem não avaliou e encerrar. Conta o CICLO, não as avaliações pendentes
      // dentro dele (ver o comentário do tipo).
      ciclosAvaliacaoAEncerrar: cliente.cicloAvaliacao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, encerrado: false, dataFim: { lt: hoje } },
      }),
      // Pesquisa ainda ACTIVE — aberta para os colaboradores responderem e
      // esperando o RH encerrar. Só ACTIVE: DRAFT não chegou a ninguém e
      // FINISHED/ARCHIVED já foi fechada.
      //
      // Agrupa pelo `empresaId` da Pesquisa, que é o CNPJ onde ela nasceu (o
      // vínculo real é com a MARCA, ver o model). Como quem chama passa os
      // CNPJs da marca inteira, a pesquisa entra uma vez só no total — não
      // multiplica por CNPJ irmão.
      pesquisasAbertas: cliente.pesquisa.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "ACTIVE" } }),
      // Ficha sem NENHUMA gravação há 6+ meses. updatedAt é proxy — qualquer
      // edição conta — mas é o campo que existe.
      fichasDesatualizadas: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, updatedAt: { lt: seisMesesAtras } },
      }),
      // Contrato por prazo determinado chegando ao fim. Inclui o que JÁ venceu
      // (sem piso na data): passar do termo é justamente o que transforma o
      // contrato em indeterminado, então um vencimento esquecido tem que
      // continuar cobrando, não sumir da tela por ter passado.
      contratosVencendo: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          ativo: true,
          tipoContrato: { in: [...CONTRATOS_POR_PRAZO] },
          dataFimContrato: { not: null, lte: limite },
        },
      }),
      // Dependente declarado para IRRF sem CPF. A Receita exige CPF de todo
      // dependente, de qualquer idade (IN RFB 1.760/2017): sem ele a dedução
      // cai na malha e o desconto vira diferença a pagar pelo colaborador.
      // Conta PESSOAS, não dependentes — é o colaborador que o RH vai chamar.
      dependentesSemCpf: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dependentes: { some: { irrf: true, cpf: null } } },
      }),
      // Atestado JÁ APROVADO e abonado sem o papel anexado: a falta foi
      // perdoada e não há documento que sustente o abono numa fiscalização.
      //
      // O filtro por APROVADA não é detalhe — é o que impede contar duas vezes.
      // Atestado ainda PENDENTE já entra em `aprovacoes`; sem este recorte, o
      // mesmo item somaria nos dois contadores e inflaria o total da tela.
      atestadosSemDocumento: cliente.ausencia.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, tipo: "ATESTADO", status: "APROVADA", abonada: true, arquivoId: null },
      }),
      // Horas extras da competência ABERTA, somadas por pessoa. Aqui o groupBy
      // é por colaborador (não por empresa): o teto do art. 59 é individual, e
      // agregar por empresa antes de comparar diluiria quem estourou sozinho no
      // meio de um time que não fez hora nenhuma. A contagem por empresa sai no
      // pós-processamento, logo abaixo.
      horasExtras: cliente.eventoFolha.groupBy({
        by: ["empresaId", "colaboradorId"],
        _sum: { quantidade: true },
        where: {
          empresaId,
          tipo: { in: [...RUBRICAS_HORA_EXTRA] },
          competencia: { status: "ABERTA" },
        },
      }),
      // Ativo sem Telegram vinculado — null OU "": mesma condição da lacuna
      // (lib/dashboard.ts) e da lista (?lacuna=telegram), para os três números
      // baterem sempre.
      semTelegram: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, OR: [{ telegramChatId: null }, { telegramChatId: "" }] },
      }),
      // Ficha com campo essencial em branco. A regra vive em
      // CADASTRO_INCOMPLETO_WHERE, ao lado do predicado que a lista usa.
      cadastrosIncompletos: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, ...CADASTRO_INCOMPLETO_WHERE },
      }),
      // ---- as oito de 19/08/2026 (ver os comentários no tipo Pendencias) ----
      // Ajuste de ponto esperando decisão. Mesma consulta que a tela de
      // Aprovações faz desde 11/08/2026 — se as duas divergirem, o cartão diz
      // um número e a fila mostra outro.
      ajustesPontoPendentes: cliente.tratamentoPonto.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, status: "PENDENTE" },
      }),
      // "Fale com o RH" sem resposta. Sem filtro de `ativo`: a pergunta de
      // quem já saiu continua sendo uma pergunta sem resposta, e a tela
      // /mensagens também a mostra.
      mensagensSemResposta: cliente.mensagemPortal.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, respondidaEm: null },
      }),
      // Entrega sem confirmação de quem recebeu. Devolvida sai da conta —
      // não há mais o que confirmar.
      entregasNaoConfirmadas: cliente.entregaAoColaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, confirmadoEm: null, devolvidoEm: null, colaborador: { ativo: true } },
      }),
      // Advertência/suspensão sem assinatura colhida.
      disciplinarSemAssinatura: cliente.ocorrenciaDisciplinar.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, statusAssinatura: "PENDENTE", colaborador: { ativo: true } },
      }),
      // Plano de ação vencido — a regra vive em planoAcaoVencidoWhere, a
      // mesma que o alerta AL09 usa: o e-mail da diretoria, o sinal da
      // Central e este cartão têm que estar falando do mesmo conjunto de
      // planos, e cópia "igual de propósito" já divergiu uma vez (ver o
      // comentário do helper).
      planosAcaoVencidos: cliente.planoAcao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ...planoAcaoVencidoWhere(hoje) },
      }),
      // Desligado sem nenhum item de offboarding criado. Mesma regra do resumo
      // da tela /desligamentos (campo `semChecklist`), dispensa inclusive.
      desligamentosSemChecklist: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          dataDesligamento: { not: null },
          checklistDispensado: false,
          checklistDesligamento: { none: {} },
        },
      }),
      // Desligado sem entrevista de saída. Par da anterior, mesma dispensa —
      // mas SÓ saída que já aconteceu (`lte: hoje`): quem está em aviso prévio
      // ainda trabalha, e a entrevista de saída dele não tem como existir.
      // O checklist é diferente de propósito (precisa existir ANTES da saída);
      // a mesma régua vale no resumo da tela /desligamentos.
      desligamentosSemEntrevista: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          dataDesligamento: { not: null, lte: hoje },
          checklistDispensado: false,
          entrevistaDesligamento: { is: null },
        },
      }),
      // Sinal ainda sem triagem. `tipo` exclui PLANO_VENCIDO para o mesmo plano
      // não contar duas vezes (ver o comentário no tipo). O resultado deste
      // groupBy traz `empresaId: string | null` — Sinal de GRUPO/MARCA não tem
      // CNPJ —, por isso ele é somado num laço próprio lá embaixo em vez de
      // passar pelo helper `somar`, que exige a chave não-nula.
      sinaisAbertosPorEmpresa: cliente.sinal.groupBy({
        by: [...por],
        _count: contar,
        where: {
          empresaId,
          status: "ABERTO",
          gravidade: { in: ["CRITICA", "ALTA"] },
          tipo: { not: "PLANO_VENCIDO" },
        },
      }),
    });

  const somar = (linhas: LinhaAgrupada[], aplicar: (p: Pendencias, n: number) => void) => {
    for (const linha of linhas) {
      const p = mapa.get(linha.empresaId);
      if (p) aplicar(p, linha._count?._all ?? 0);
    }
  };

  // `aprovacoes` junta férias e ausências — as duas somam no mesmo número.
  somar(feriasPendentes, (p, n) => (p.aprovacoes += n));
  somar(ausenciasPendentes, (p, n) => (p.aprovacoes += n));
  somar(documentosAConferir, (p, n) => (p.documentosAConferir = n));
  somar(asoVencendo, (p, n) => (p.asoVencendo = n));
  somar(certificadosVencendo, (p, n) => (p.certificadosVencendo = n));
  somar(catPendente, (p, n) => (p.catPendente = n));
  somar(integracoesAtrasadas, (p, n) => (p.integracoesAtrasadas = n));
  somar(epiVencido, (p, n) => (p.epiVencido = n));
  somar(feriasVencidas, (p, n) => (p.feriasVencidas = n));
  somar(avisoPrevio, (p, n) => (p.avisoPrevio = n));
  somar(desligamentosIncompletos, (p, n) => (p.desligamentosIncompletos = n));
  somar(ciclosAvaliacaoAEncerrar, (p, n) => (p.ciclosAvaliacaoAEncerrar = n));
  somar(pesquisasAbertas, (p, n) => (p.pesquisasAbertas = n));
  somar(fichasDesatualizadas, (p, n) => (p.fichasDesatualizadas = n));
  somar(contratosVencendo, (p, n) => (p.contratosVencendo = n));
  somar(dependentesSemCpf, (p, n) => (p.dependentesSemCpf = n));
  somar(atestadosSemDocumento, (p, n) => (p.atestadosSemDocumento = n));
  somar(semTelegram, (p, n) => (p.semTelegram = n));
  somar(cadastrosIncompletos, (p, n) => (p.cadastrosIncompletos = n));
  somar(ajustesPontoPendentes, (p, n) => (p.ajustesPontoPendentes = n));
  somar(mensagensSemResposta, (p, n) => (p.mensagensSemResposta = n));
  somar(entregasNaoConfirmadas, (p, n) => (p.entregasNaoConfirmadas = n));
  somar(disciplinarSemAssinatura, (p, n) => (p.disciplinarSemAssinatura = n));
  somar(planosAcaoVencidos, (p, n) => (p.planosAcaoVencidos = n));
  somar(desligamentosSemChecklist, (p, n) => (p.desligamentosSemChecklist = n));
  somar(desligamentosSemEntrevista, (p, n) => (p.desligamentosSemEntrevista = n));

  // Sinal à parte: `empresaId` é opcional no model (sinal de GRUPO/MARCA não
  // pertence a CNPJ nenhum), então a linha não encaixa em LinhaAgrupada. Os
  // nulos são descartados de propósito — a tela de Pendências é por empresa, e
  // um sinal de grupo não tem a quem ser cobrado aqui. Ele continua visível na
  // Central de Sinais, que já o mostra para todo mundo.
  for (const linha of sinaisAbertosPorEmpresa) {
    if (!linha.empresaId) continue;
    const p = mapa.get(linha.empresaId);
    if (p) p.sinaisAbertos = linha._count._all;
  }

  // Uma linha por colaborador que lançou hora extra no mês aberto; conta quem
  // passou do teto. `_sum` volta null quando todas as quantidades da pessoa são
  // nulas — lançamento em valor, não em horas —, e null nunca estoura o teto.
  for (const linha of horasExtras) {
    const p = mapa.get(linha.empresaId);
    if (p && (linha._sum.quantidade ?? 0) > LIMITE_HORAS_EXTRAS_MES) p.horasExtrasExcedidas += 1;
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
 */
export async function empresasComRegistro(
  empresaIds: string[],
  cliente: Cliente = prisma,
): Promise<Map<keyof Pendencias, Set<string>>> {
  const mapa = new Map<keyof Pendencias, Set<string>>();
  if (empresaIds.length === 0) return mapa;

  const empresaId = { in: empresaIds };
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  // As situações e onde ver se o módulo de cada uma já foi usado. As que
  // dependem só de Colaborador (férias vencidas, aviso prévio, ficha
  // desatualizada) ficam de fora — sempre há base para calcular.
  //
  // `groupBy` e não `findFirst`: a tela do grupo precisa saber isso por MARCA,
  // e uma consulta por marca multiplicaria as idas ao banco na primeira tela
  // depois do login. Assim são 21, quantas marcas forem.
  //
  // Consultas CHAVEADAS pela pendência (helper `todas`) — as duas listas
  // paralelas pareadas por posição saíram em 20/08/2026: com 21 resultados do
  // mesmo tipo, inserir uma chave no meio e a consulta no fim compilava limpo
  // e todas as chaves seguintes liam o conjunto da vizinha. O `satisfies`
  // garante que cada chave é uma pendência de verdade. `sinaisAbertos`
  // continua fora: o groupBy dele devolve `empresaId: string | null` (sinal de
  // GRUPO/MARCA não tem CNPJ) e é resolvido logo abaixo.
  const desligadosPorEmpresa = cliente.colaborador.groupBy({
    by: [...por],
    _count: contar,
    where: { empresaId, dataDesligamento: { not: null } },
  });

  const [registros, sinaisDaEmpresa] = await Promise.all([
    todas({
      asoVencendo: cliente.exameOcupacional.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      certificadosVencendo: cliente.certificadoNR.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      epiVencido: cliente.entregaEPI.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      catPendente: cliente.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      integracoesAtrasadas: cliente.checklistIntegracao.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      desligamentosIncompletos: cliente.checklistDesligamento.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      documentosAConferir: cliente.documentoColaborador.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      // Ciclo, não avaliação: é o que a pendência conta desde 10/08/2026, e uma
      // empresa que criou ciclo mas ainda não gerou avaliação já usa o módulo.
      ciclosAvaliacaoAEncerrar: cliente.cicloAvaliacao.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      atestadosSemDocumento: cliente.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      horasExtrasExcedidas: cliente.eventoFolha.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      // Dependente não tem empresaId — só colaboradorId. A pergunta vira "quais
      // empresas têm alguém com dependente".
      dependentesSemCpf: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, dependentes: { some: {} } },
      }),
      // Contrato é diferente dos outros: a tabela é Colaborador, que nunca está
      // vazia. O que falta é a classificação — ninguém com contrato por prazo
      // marcado significa que o RH ainda não preencheu `tipoContrato`, e a
      // pendência não tem como existir.
      contratosVencendo: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, tipoContrato: { in: [...CONTRATOS_POR_PRAZO] } },
      }),
      // Qualquer pesquisa, em qualquer status: quem nunca criou uma não está com
      // as pesquisas "em dia", está sem o módulo. Sem isto, marca que nunca abriu
      // pesquisa apareceria no verde junto de quem encerra tudo em prazo.
      pesquisasAbertas: cliente.pesquisa.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      // Qualquer colaborador ativo: se não tem ninguém, o módulo de cadastros
      // nunca foi aberto. Com isto a verificação de "tem registro" e "precisa de
      // ação" ficam alinhadas para cadastrosIncompletos.
      cadastrosIncompletos: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true },
      }),
      // ---- as sete de 19/08/2026 ----
      // Ponto: a pergunta é se o módulo é USADO, não se há tratamento pendente —
      // empresa que bate ponto e não tem nenhum ajuste em aberto está em dia de
      // verdade; empresa que nunca bateu não tem o que avaliar.
      //
      // A prova é `pontoLiberado` no Colaborador, não a tabela RegistroPonto:
      // esta consulta roda na primeira tela depois do login, para todas as
      // empresas de uma vez, e RegistroPonto cresce por batida (quatro por
      // pessoa por dia) — varrê-la aqui custaria mais que todas as outras 21
      // somadas. Colaborador tem centenas de linhas e responde a mesma
      // pergunta: sem ninguém com ponto liberado não existe ajuste possível.
      ajustesPontoPendentes: cliente.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, pontoLiberado: true },
      }),
      mensagensSemResposta: cliente.mensagemPortal.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      entregasNaoConfirmadas: cliente.entregaAoColaborador.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      disciplinarSemAssinatura: cliente.ocorrenciaDisciplinar.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      planosAcaoVencidos: cliente.planoAcao.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
      // As duas de desligamento compartilham a base: quem nunca desligou ninguém
      // não está com o offboarding "em dia", está sem o módulo. A MESMA promise
      // entra nas duas chaves — o banco responde uma vez só.
      desligamentosSemChecklist: desligadosPorEmpresa,
      desligamentosSemEntrevista: desligadosPorEmpresa,
    }),
    // Qualquer sinal já detectado nesta empresa, em qualquer status ou
    // gravidade: quem nunca teve sinal nenhum não está "sem sinais críticos",
    // está sem histórico para o zero significar alguma coisa.
    cliente.sinal.groupBy({ by: [...por], _count: contar, where: { empresaId } }),
  ]);

  // Prova de tipo no padrão de CoberturaCompleta, e não `satisfies` no objeto:
  // o `satisfies` vira tipo contextual do argumento e vaza para a inferência
  // do `groupBy` do Prisma, que passa a exigir que o ARGUMENTO seja um
  // LinhaAgrupada[] (era exatamente o erro que mantinha as listas posicionais).
  // Checar DEPOIS da inferência valida a mesma coisa sem contaminá-la.
  type ChaveForaDePendencias = Exclude<keyof typeof registros, keyof Pendencias>;
  const _sohChavesDePendencia: [ChaveForaDePendencias] extends [never] ? true : never = true;
  void _sohChavesDePendencia;
  const _resultadosAgrupados: (typeof registros)[keyof typeof registros] extends LinhaAgrupada[]
    ? true
    : never = true;
  void _resultadosAgrupados;

  for (const [chave, linhas] of Object.entries(registros) as [keyof Pendencias, LinhaAgrupada[]][]) {
    mapa.set(chave, new Set(linhas.map((l) => l.empresaId)));
  }

  // Fora do laço porque o tipo não bate (ver o comentário na lista de chaves):
  // sinal de GRUPO/MARCA tem `empresaId` nulo e é descartado aqui — não
  // pertence a CNPJ nenhum para efeito desta tela.
  mapa.set(
    "sinaisAbertos",
    new Set(sinaisDaEmpresa.map((l) => l.empresaId).filter((id): id is string => id !== null)),
  );
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
