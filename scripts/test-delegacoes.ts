// A prova do PR 2 do módulo Delegações: a máquina de estados e as 6 regras
// invioláveis (lib/delegacoes/estados.ts), sem banco e sem sessão. O coração é
// a varredura da MATRIZ COMPLETA — toda transição × todo status × todo papel —
// contra a tabela TRANSICOES: o que a tabela permite tem que passar, e TUDO
// FORA dela tem que ser negado. Linha nova na tabela entra na prova de graça.
//
//   npx tsx scripts/test-delegacoes.ts

import {
  CRITICIDADES,
  EVENTO_DA_TRANSICAO,
  HORAS_LIMITE_ACEITE,
  STATUS_DEMANDA,
  STATUS_EM_ANDAMENTO,
  STATUS_QUE_REPACTUAM,
  STATUS_TERMINAIS,
  TIPOS_EVENTO,
  TITULO_MAXIMO,
  TRANSICOES,
  papelNaDemanda,
  prazoDoFormulario,
  prazoLimiteAceite,
  validarCriacao,
  validarMarcarEmRisco,
  validarRepactuacao,
  validarReporte,
  validarTransicao,
  type DadosCriacao,
  type StatusDemanda,
  type Transicao,
} from "../lib/delegacoes/estados";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

// Os três chapéus de toda a prova.
const SOL = "user-solicitante";
const RESP = "user-responsavel";
const OUTRO = "user-terceiro";

// `evidenciaExigida` faz parte do retrato da demanda (não do payload), então
// entra aqui. TEXTO por padrão: a evidência textual de DADOS_COMPLETOS serve à
// matriz inteira sem que o tipo interfira em quem pode o quê.
const demandaEm = (status: StatusDemanda, evidenciaExigida = "TEXTO") => ({
  status,
  solicitanteId: SOL,
  responsavelId: RESP,
  evidenciaExigida,
});

// Payload que satisfaz TODA pré-condição de dados: com ele na mão, uma negativa
// da matriz só pode vir de estado ou autoria — nunca de dado faltando.
const DADOS_COMPLETOS = {
  criterioAceite: "Relatório entregue e aprovado",
  prazo: new Date("2026-09-15T12:00:00Z"),
  evidenciaTexto: "https://exemplo.com/prova",
  arquivoId: null,
  motivo: "Motivo registrado para o histórico",
};

console.log("\nCriação — regras 1 e 2 e domínios (validarCriacao)\n");
{
  const base: DadosCriacao = {
    titulo: "Cotação de frota para renovação",
    criterioAceite: "Três orçamentos formais anexados",
    evidenciaExigida: "ARQUIVO",
    criticidade: 2,
    prazo: new Date("2026-09-10T12:00:00Z"),
    periodicidadeRetorno: "SEMANAL",
    solicitanteId: SOL,
    responsavelId: RESP,
  };
  ok(validarCriacao(base).ok, "demanda completa passa");
  ok(!validarCriacao({ ...base, titulo: "   " }).ok, "sem título, nega");
  ok(
    !validarCriacao({ ...base, titulo: "x".repeat(TITULO_MAXIMO + 1) }).ok,
    `título acima de ${TITULO_MAXIMO} caracteres, nega`,
  );
  ok(validarCriacao({ ...base, titulo: "x".repeat(TITULO_MAXIMO) }).ok, `título com exatos ${TITULO_MAXIMO} passa`);
  // Regra 2, literal: sem criterio_aceite o registro NÃO é salvo.
  ok(!validarCriacao({ ...base, criterioAceite: "" }).ok, "REGRA 2: sem critério de aceite, o registro não é salvo");
  ok(!validarCriacao({ ...base, criterioAceite: "   " }).ok, "REGRA 2: critério só de espaços também não salva");
  ok(!validarCriacao({ ...base, evidenciaExigida: "PRINT" }).ok, "tipo de evidência fora do domínio, nega");
  ok(!validarCriacao({ ...base, criticidade: 0 }).ok, "criticidade 0, nega");
  ok(!validarCriacao({ ...base, criticidade: 4 }).ok, "criticidade 4, nega");
  ok(!validarCriacao({ ...base, prazo: null }).ok, "sem prazo, nega — prazo é timestamp, nunca texto livre");
  ok(!validarCriacao({ ...base, prazo: new Date("data inválida") }).ok, "prazo inválido (NaN), nega");
  ok(!validarCriacao({ ...base, periodicidadeRetorno: "MENSAL" }).ok, "periodicidade fora do domínio, nega");
  ok(!validarCriacao({ ...base, solicitanteId: "" }).ok, "sem solicitante, nega");
  // Regra 1: dono único — id vazio dá erro legível antes da FK.
  ok(!validarCriacao({ ...base, responsavelId: " " }).ok, "REGRA 1: sem o responsável único, nega");
}

console.log("\nMatriz completa — transição × status × papel\n");
{
  // A varredura: 7 transições × 7 status × 3 papéis = 147 combinações. Cada
  // uma tem que casar EXATAMENTE com a tabela TRANSICOES; qualquer desvio
  // (permitir fora da tabela ou negar dentro dela) derruba o teste.
  const atores: Array<[string, "SOLICITANTE" | "RESPONSAVEL" | "TERCEIRO"]> = [
    [SOL, "SOLICITANTE"],
    [RESP, "RESPONSAVEL"],
    [OUTRO, "TERCEIRO"],
  ];
  let combinacoes = 0;
  let desvios = 0;
  for (const transicao of Object.keys(TRANSICOES) as Transicao[]) {
    const regra = TRANSICOES[transicao];
    for (const status of STATUS_DEMANDA) {
      for (const [atorId, papel] of atores) {
        combinacoes++;
        const esperado = regra.de.includes(status) && papel === regra.quem;
        const veredito = validarTransicao(transicao, demandaEm(status), atorId, DADOS_COMPLETOS);
        if (veredito.ok !== esperado) {
          desvios++;
          console.log(
            `     desvio: ${transicao} em ${status} por ${papel} — esperado ${esperado ? "permitir" : "negar"}, veio ${veredito.ok ? "permitiu" : `negou ("${(veredito as { erro: string }).erro}")`}`,
          );
        }
      }
    }
  }
  igual(desvios, 0, `matriz inteira confere (${combinacoes} combinações, 0 desvios)`);
}

console.log("\nRegra 3 — quem encerra é quem pediu, NUNCA o responsável\n");
{
  const entregue = demandaEm("ENTREGUE");
  ok(validarTransicao("ENCERRAR", entregue, SOL).ok, "solicitante encerra a ENTREGUE");
  const tentativa = validarTransicao("ENCERRAR", entregue, RESP);
  ok(!tentativa.ok, "REGRA 3: responsável NÃO encerra a própria demanda");
  ok(
    !tentativa.ok && tentativa.erro.includes("quem pediu"),
    "e a negativa explica a regra — não é um 'sem permissão' genérico",
  );
  ok(!validarTransicao("ENCERRAR", entregue, OUTRO).ok, "terceiro também não encerra");
  // O responsável PARA em ENTREGUE — devolver e cancelar também não são dele.
  ok(!validarTransicao("DEVOLVER", entregue, RESP, DADOS_COMPLETOS).ok, "responsável não devolve a própria entrega");
  ok(!validarTransicao("CANCELAR", demandaEm("EM_EXECUCAO"), RESP, DADOS_COMPLETOS).ok, "responsável não cancela");
}

console.log("\nRegra 4 — entrega sem evidência é rejeitada\n");
{
  for (const status of STATUS_EM_ANDAMENTO) {
    ok(
      !validarTransicao("ENTREGAR", demandaEm(status), RESP, {}).ok,
      `REGRA 4: ENTREGAR de ${status} sem evidência nenhuma, nega`,
    );
    ok(
      !validarTransicao("ENTREGAR", demandaEm(status), RESP, { evidenciaTexto: "   ", arquivoId: "" }).ok,
      `REGRA 4: evidência vazia (espaços) em ${status} também nega`,
    );
  }
  ok(
    validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO"), RESP, { evidenciaTexto: "NF 4412" }).ok,
    "evidência de texto/número/link basta",
  );
  ok(
    validarTransicao("ENTREGAR", demandaEm("ACEITA", "ARQUIVO"), RESP, { arquivoId: "arq_123" }).ok,
    "evidência de arquivo basta — e entregar direto de ACEITA é permitido",
  );
  ok(
    !validarTransicao("ENTREGAR", demandaEm("ENVIADA"), RESP, { evidenciaTexto: "prova" }).ok,
    "ENVIADA não entrega — aceitar vem antes (regra 5 não é atropelada)",
  );
}

console.log("\nMotivo obrigatório — devolver e cancelar\n");
{
  ok(!validarTransicao("DEVOLVER", demandaEm("ENTREGUE"), SOL, {}).ok, "devolver sem motivo, nega");
  ok(
    validarTransicao("DEVOLVER", demandaEm("ENTREGUE"), SOL, { motivo: "Faltou o orçamento da terceira empresa" }).ok,
    "devolver com motivo passa — a demanda volta a EM_EXECUCAO",
  );
  ok(!validarTransicao("CANCELAR", demandaEm("ENVIADA"), SOL, {}).ok, "cancelar sem motivo, nega");
  ok(validarTransicao("CANCELAR", demandaEm("RASCUNHO"), SOL, { motivo: "Perdeu o sentido" }).ok, "cancelar rascunho com motivo passa");
}

console.log("\nRegra 2 na porta do envio — revalidada em ENVIAR\n");
{
  const rascunho = demandaEm("RASCUNHO");
  ok(
    !validarTransicao("ENVIAR", rascunho, SOL, { criterioAceite: "", prazo: new Date() }).ok,
    "ENVIAR sem critério de aceite, nega",
  );
  ok(
    !validarTransicao("ENVIAR", rascunho, SOL, { criterioAceite: "ok", prazo: null }).ok,
    "ENVIAR sem prazo, nega",
  );
  ok(
    validarTransicao("ENVIAR", rascunho, SOL, { criterioAceite: "ok", prazo: new Date("2026-09-01") }).ok,
    "ENVIAR com os dois passa",
  );
}

console.log("\nEstados terminais — deles não se sai\n");
{
  for (const status of STATUS_TERMINAIS) {
    for (const transicao of Object.keys(TRANSICOES) as Transicao[]) {
      const v = validarTransicao(transicao, demandaEm(status), SOL, DADOS_COMPLETOS);
      if (v.ok) {
        falhas++;
        console.log(`❌ ${transicao} saiu de ${status} — terminal vazou`);
      }
    }
  }
  ok(true, "nenhuma transição sai de ENCERRADA nem de CANCELADA (checado acima)");
  ok(
    !validarRepactuacao(demandaEm("ENCERRADA"), RESP, { prazoNovo: new Date(), motivo: "x" }).ok,
    "nem repactuação sai de estado terminal",
  );
}

console.log("\nRegra 6 — repactuação registrada, prazoOriginal intocável\n");
{
  const dados = { prazoNovo: new Date("2026-09-20T12:00:00Z"), motivo: "Fornecedor atrasou o orçamento" };
  for (const status of STATUS_QUE_REPACTUAM) {
    ok(validarRepactuacao(demandaEm(status), RESP, dados).ok, `responsável repactua em ${status}`);
  }
  ok(!validarRepactuacao(demandaEm("RASCUNHO"), RESP, dados).ok, "rascunho não repactua — ajusta o prazo direto");
  ok(!validarRepactuacao(demandaEm("ENTREGUE"), RESP, dados).ok, "com a entrega feita não há prazo a repactuar");
  ok(!validarRepactuacao(demandaEm("ACEITA"), SOL, dados).ok, "solicitante não repactua — quem pede mais prazo é o responsável");
  ok(!validarRepactuacao(demandaEm("ACEITA"), OUTRO, dados).ok, "terceiro não repactua");
  ok(!validarRepactuacao(demandaEm("ACEITA"), RESP, { ...dados, motivo: "  " }).ok, "REGRA 6: repactuar sem motivo, nega");
  ok(!validarRepactuacao(demandaEm("ACEITA"), RESP, { ...dados, prazoNovo: null }).ok, "repactuar sem prazo novo, nega");
  // Sobre a imutabilidade do prazoOriginal, o que é honesto afirmar aqui:
  // repactuar é um caminho PRÓPRIO (não é transição de status) e a máquina só
  // devolve veredito — ela não escreve nada. A imutabilidade em si é contrato
  // de ESCRITA das actions (PR 3), sem trigger no banco, e portanto não é
  // provável neste teste. O que se prova é que repactuar não passa por
  // validarTransicao: nenhuma transição da tabela mexe em prazo.
  ok(
    !(Object.keys(TRANSICOES) as Transicao[]).some((t) => t.includes("REPACT")),
    "REGRA 6: repactuar não é transição de status — tem caminho próprio, que preserva o status",
  );
  ok(
    validarRepactuacao(demandaEm("ACEITA"), RESP, dados).ok &&
      TRANSICOES.ENVIAR.para === "ENVIADA",
    "e a tabela de transições segue intacta ao lado dela",
  );
}

console.log("\nFlag emRisco — ortogonal ao status\n");
{
  for (const status of STATUS_EM_ANDAMENTO) {
    ok(validarMarcarEmRisco(demandaEm(status), RESP).ok, `responsável liga risco em ${status}`);
    ok(validarMarcarEmRisco(demandaEm(status), SOL).ok, `solicitante liga risco em ${status}`);
    ok(validarMarcarEmRisco(demandaEm(status), null).ok, `o sistema (cron/classificador) liga risco em ${status}`);
  }
  ok(!validarMarcarEmRisco(demandaEm("ACEITA"), OUTRO).ok, "terceiro não marca risco");
  for (const status of STATUS_DEMANDA.filter((s) => !STATUS_EM_ANDAMENTO.includes(s))) {
    ok(!validarMarcarEmRisco(demandaEm(status), RESP).ok, `risco não liga em ${status}`);
  }
}

console.log("\nRegra 5 — aceite ativo: 24h crítica, 48h alta, 72h normal\n");
{
  igual(HORAS_LIMITE_ACEITE[1], 24, "crítica: 24h para aceitar");
  igual(HORAS_LIMITE_ACEITE[2], 48, "alta: 48h para aceitar");
  igual(HORAS_LIMITE_ACEITE[3], 72, "normal: 72h para aceitar");
  const enviadaEm = new Date("2026-09-01T10:00:00Z");
  for (const criticidade of CRITICIDADES) {
    const limite = prazoLimiteAceite({ enviadaEm, criticidade });
    const esperado = new Date(enviadaEm.getTime() + HORAS_LIMITE_ACEITE[criticidade] * 3_600_000);
    igual(limite?.toISOString(), esperado.toISOString(), `criticidade ${criticidade}: limite = envio + ${HORAS_LIMITE_ACEITE[criticidade]}h`);
  }
  igual(prazoLimiteAceite({ enviadaEm: null, criticidade: 1 }), null, "sem envio ainda, não há limite de aceite");
  igual(prazoLimiteAceite({ enviadaEm, criticidade: 9 }), null, "criticidade desconhecida não inventa limite");
}

console.log("\nAuto-delegação — no piloto todos delegam para si mesmos também\n");
{
  // Quando solicitante == responsável, a pessoa carrega os DOIS chapéus: toda
  // porta dos dois papéis tem que abrir para ela. A matriz principal roda
  // sempre com solicitante ≠ responsável, então sem este bloco uma regressão
  // que tornasse os papéis mutuamente exclusivos (trocar `ehResponsavel` por
  // `papelNaDemanda(...) === "RESPONSAVEL"`, que devolve SOLICITANTE quando os
  // ids coincidem) passaria batida — e quebraria justamente o piloto.
  const propria = (status: StatusDemanda, evidenciaExigida = "TEXTO") => ({
    status,
    solicitanteId: SOL,
    responsavelId: SOL,
    evidenciaExigida,
  });
  igual(papelNaDemanda(SOL, propria("ENVIADA")), "SOLICITANTE", "com os dois chapéus, o papel dominante é SOLICITANTE");

  // Chapéu de RESPONSÁVEL.
  ok(validarTransicao("ACEITAR", propria("ENVIADA"), SOL).ok, "aceita a própria demanda");
  ok(validarTransicao("INICIAR_EXECUCAO", propria("ACEITA"), SOL).ok, "inicia a execução da própria demanda");
  ok(
    validarTransicao("ENTREGAR", propria("EM_EXECUCAO"), SOL, { evidenciaTexto: "NF 1" }).ok,
    "entrega a própria demanda",
  );
  ok(validarReporte(propria("EM_EXECUCAO"), SOL, "andando").ok, "reporta na própria demanda");
  ok(
    validarRepactuacao(propria("ACEITA"), SOL, { prazoNovo: new Date("2026-09-05"), motivo: "agenda" }).ok,
    "repactua o próprio prazo",
  );

  // Chapéu de SOLICITANTE.
  ok(validarTransicao("ENVIAR", propria("RASCUNHO"), SOL, DADOS_COMPLETOS).ok, "envia a própria demanda");
  ok(validarTransicao("ENCERRAR", propria("ENTREGUE"), SOL).ok, "encerra a própria demanda");
  ok(
    validarTransicao("DEVOLVER", propria("ENTREGUE"), SOL, { motivo: "faltou X" }).ok,
    "devolve a própria entrega",
  );
  ok(
    validarTransicao("CANCELAR", propria("EM_EXECUCAO"), SOL, { motivo: "mudou a prioridade" }).ok,
    "cancela a própria demanda",
  );
  ok(validarMarcarEmRisco(propria("ACEITA"), SOL).ok, "marca risco na própria demanda");
}

console.log("\nStatus fora do domínio — falha FECHADA\n");
{
  // `status` chega como String do banco (convenção do repo: sem enum nativo).
  // Um valor inesperado — dado mexido à mão, migração futura, typo — não pode
  // virar permissão. Toda transição tem que NEGAR, e o fail-closed precisa
  // estar travado por teste: sem isto, uma refatoração pode abri-lo calado.
  const lixo = ["", "aceita", "ACEITO", "PENDENTE", "undefined", "DROP TABLE"];
  let vazou = 0;
  for (const status of lixo) {
    for (const transicao of Object.keys(TRANSICOES) as Transicao[]) {
      for (const ator of [SOL, RESP, OUTRO]) {
        const v = validarTransicao(transicao, { status, solicitanteId: SOL, responsavelId: RESP, evidenciaExigida: "TEXTO" }, ator, DADOS_COMPLETOS);
        if (v.ok) {
          vazou++;
          console.log(`     vazou: ${transicao} passou com status "${status}" por ${ator}`);
        }
      }
    }
  }
  igual(vazou, 0, `status inválido nega em todas as portas (${lixo.length} valores × 7 transições × 3 papéis)`);
  ok(
    !validarRepactuacao({ status: "aceita", solicitanteId: SOL, responsavelId: RESP, evidenciaExigida: "TEXTO" }, RESP, {
      prazoNovo: new Date("2026-09-20"),
      motivo: "x",
    }).ok,
    "repactuação também nega status fora do domínio (minúscula não é ACEITA)",
  );
  ok(
    !validarMarcarEmRisco({ status: "EM EXECUCAO", solicitanteId: SOL, responsavelId: RESP, evidenciaExigida: "TEXTO" }, RESP).ok,
    "risco também nega status fora do domínio",
  );
}

console.log("\nLog imutável — toda transição tem evento, 1:1\n");
{
  const transicoes = Object.keys(TRANSICOES) as Transicao[];
  ok(
    transicoes.every((t) => (TIPOS_EVENTO as readonly string[]).includes(EVENTO_DA_TRANSICAO[t])),
    "o evento de cada transição existe no catálogo TIPOS_EVENTO",
  );
  igual(
    new Set(transicoes.map((t) => EVENTO_DA_TRANSICAO[t])).size,
    transicoes.length,
    "nenhum evento serve a duas transições — o log conta a história sem ambiguidade",
  );
  ok((TIPOS_EVENTO as readonly string[]).includes("CRIADA"), "a criação também tem evento (CRIADA)");
  ok(
    (TIPOS_EVENTO as readonly string[]).includes("REPACTUADA"),
    "a repactuação também tem evento (REPACTUADA)",
  );
}

console.log("\nTipo de evidência — a entrega tem que ser DO TIPO exigido\n");
{
  // A regra 4 tem duas metades: TER evidência (coberto acima) e ser a
  // evidência COMBINADA — quem exigiu arquivo não aceita link no lugar.
  //
  // A exigência vem do RETRATO da demanda, não do payload da transição: é o
  // que faz esta metade falhar FECHADA. Enquanto morava no payload (campo
  // opcional), uma action que esquecesse de repassá-la ganhava aprovação
  // silenciosa — furo apontado na revisão adversarial de 28/08/2026.
  ok(
    !validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", "ARQUIVO"), RESP, {
      evidenciaTexto: "segue o link",
    }).ok,
    "exigiu ARQUIVO: texto/link no lugar, nega",
  );
  ok(
    validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", "ARQUIVO"), RESP, { arquivoId: "arq_1" }).ok,
    "exigiu ARQUIVO e veio arquivo, passa",
  );
  ok(
    !validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", "NUMERO"), RESP, { arquivoId: "arq_1" }).ok,
    "exigiu NÚMERO: só arquivo, nega — o número vai no campo de evidência",
  );
  ok(
    validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", "NUMERO"), RESP, {
      evidenciaTexto: "R$ 41.320,00",
    }).ok,
    "exigiu NÚMERO e veio no texto, passa",
  );
  ok(
    validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", "LINK"), RESP, {
      evidenciaTexto: "https://drive.exemplo/x",
      arquivoId: "arq_1",
    }).ok,
    "veio dos dois jeitos e o exigido (link) está lá, passa",
  );
  // A prova de que NÃO dá para escapar por omissão: o tipo não é opcional no
  // retrato, então toda chamada carrega a exigência — e ela é sempre aplicada.
  for (const tipo of ["LINK", "NUMERO", "TEXTO"]) {
    ok(
      !validarTransicao("ENTREGAR", demandaEm("EM_EXECUCAO", tipo), RESP, { arquivoId: "arq_1" }).ok,
      `exigiu ${tipo}: arquivo sozinho não substitui`,
    );
  }
}

console.log("\nReporte de progresso — quem, quando, e o gatilho da execução\n");
{
  ok(
    validarReporte(demandaEm("ACEITA"), RESP, "comecei hoje").ok,
    "responsável reporta em ACEITA (a action dispara EM_EXECUCAO sozinha — spec §4)",
  );
  ok(validarReporte(demandaEm("EM_EXECUCAO"), RESP, "60% pronto").ok, "responsável reporta em EM_EXECUCAO");
  ok(!validarReporte(demandaEm("ENVIADA"), RESP, "olhando").ok, "antes do aceite não há reporte — aceite primeiro");
  ok(!validarReporte(demandaEm("ENTREGUE"), RESP, "x").ok, "depois da entrega não há reporte");
  ok(!validarReporte(demandaEm("ACEITA"), SOL, "x").ok, "solicitante não reporta");
  ok(!validarReporte(demandaEm("ACEITA"), OUTRO, "x").ok, "terceiro não reporta");
  ok(!validarReporte(demandaEm("ACEITA"), RESP, "   ").ok, "reporte vazio não vale");
}

console.log("\nPrazo do formulário — timestamp, nunca texto livre\n");
{
  igual(
    prazoDoFormulario("2026-09-05")?.toISOString(),
    "2026-09-06T02:59:59.000Z",
    "só a data: vira 23:59:59 de Brasília DAQUELE dia (não a véspera, como seria em UTC)",
  );
  igual(
    prazoDoFormulario("2026-09-05T14:30")?.toISOString(),
    "2026-09-05T17:30:00.000Z",
    "data e hora: lidas como horário de Brasília",
  );
  // O buraco que a revisão adversarial de 28/08/2026 pegou: o parser do V8
  // ACEITA dia inexistente dentro de 01–31 e o ROLA para o mês seguinte —
  // "2026-02-30" virava 2 de março, um prazo dias depois do combinado, gravado
  // em silêncio. Não vem do <input type="date">, mas vem de POST forjado e
  // viria do bot do Telegram (PR 4) montando a string à mão.
  igual(prazoDoFormulario("2026-02-30"), null, "30 de fevereiro não existe — e NÃO rola para março");
  igual(prazoDoFormulario("2026-09-31"), null, "31 de setembro não existe — e NÃO rola para outubro");
  igual(prazoDoFormulario("2026-02-30T10:00"), null, "idem na forma com hora");
  igual(prazoDoFormulario("2026-02-28")?.toISOString(), "2026-03-01T02:59:59.000Z", "28/02 de ano comum é válido");
  igual(prazoDoFormulario("2028-02-29")?.toISOString(), "2028-03-01T02:59:59.000Z", "29/02 de ano BISSEXTO é válido");
  igual(prazoDoFormulario("2026-02-29"), null, "29/02 fora de bissexto, não");
  igual(prazoDoFormulario("2026-09-05T24:00"), null, "T24:00 é ISO-legal mas não sai de um input — nega");
  igual(prazoDoFormulario("2026-13-45"), null, "mês 13 e dia 45 nem passam na forma");
  igual(prazoDoFormulario("2026-00-10"), null, "mês 00, nega");
  igual(prazoDoFormulario("semana que vem"), null, "texto livre não vira prazo");
  igual(prazoDoFormulario("05/09/2026"), null, "formato dd/mm/aaaa digitado não vira prazo — o input manda ISO");
  igual(prazoDoFormulario(""), null, "vazio, null");
  igual(prazoDoFormulario(null), null, "null, null");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
