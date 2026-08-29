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

const demandaEm = (status: StatusDemanda) => ({
  status,
  solicitanteId: SOL,
  responsavelId: RESP,
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
    validarTransicao("ENTREGAR", demandaEm("ACEITA"), RESP, { arquivoId: "arq_123" }).ok,
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
  // A imutabilidade do prazoOriginal é contrato de escrita das actions (PR 3):
  // o que a máquina garante aqui é que repactuar é um caminho PRÓPRIO — não é
  // transição de status e não carrega prazoOriginal no payload.
  ok(!("prazoOriginal" in dados), "o payload de repactuação nem carrega prazoOriginal");
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
  // Quando solicitante == responsável, a pessoa carrega os dois chapéus: as
  // transições dos DOIS papéis têm que funcionar para ela.
  const propria = { status: "ENVIADA", solicitanteId: SOL, responsavelId: SOL };
  igual(papelNaDemanda(SOL, propria), "SOLICITANTE", "com os dois chapéus, o papel dominante é SOLICITANTE");
  ok(validarTransicao("ACEITAR", propria, SOL).ok, "aceita a própria demanda (chapéu de responsável)");
  ok(
    validarTransicao("ENCERRAR", { ...propria, status: "ENTREGUE" }, SOL).ok,
    "e encerra a própria demanda (chapéu de solicitante)",
  );
  ok(
    validarRepactuacao({ ...propria, status: "ACEITA" }, SOL, { prazoNovo: new Date("2026-09-05"), motivo: "agenda" }).ok,
    "e repactua o próprio prazo",
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
  const emExec = demandaEm("EM_EXECUCAO");
  ok(
    !validarTransicao("ENTREGAR", emExec, RESP, { evidenciaTexto: "segue o link", evidenciaExigida: "ARQUIVO" }).ok,
    "exigiu ARQUIVO: texto/link no lugar, nega",
  );
  ok(
    validarTransicao("ENTREGAR", emExec, RESP, { arquivoId: "arq_1", evidenciaExigida: "ARQUIVO" }).ok,
    "exigiu ARQUIVO e veio arquivo, passa",
  );
  ok(
    !validarTransicao("ENTREGAR", emExec, RESP, { arquivoId: "arq_1", evidenciaExigida: "NUMERO" }).ok,
    "exigiu NÚMERO: só arquivo, nega — o número vai no campo de evidência",
  );
  ok(
    validarTransicao("ENTREGAR", emExec, RESP, { evidenciaTexto: "R$ 41.320,00", evidenciaExigida: "NUMERO" }).ok,
    "exigiu NÚMERO e veio no texto, passa",
  );
  ok(
    validarTransicao("ENTREGAR", emExec, RESP, {
      evidenciaTexto: "https://drive.exemplo/x",
      arquivoId: "arq_1",
      evidenciaExigida: "LINK",
    }).ok,
    "veio dos dois jeitos e o exigido (link) está lá, passa",
  );
  ok(
    validarTransicao("ENTREGAR", emExec, RESP, { evidenciaTexto: "qualquer prova" }).ok,
    "sem o tipo informado (chamador antigo), qualquer evidência não-vazia segue valendo",
  );
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
  igual(prazoDoFormulario("semana que vem"), null, "texto livre não vira prazo");
  igual(prazoDoFormulario("05/09/2026"), null, "formato dd/mm/aaaa digitado não vira prazo — o input manda ISO");
  igual(prazoDoFormulario(""), null, "vazio, null");
  igual(prazoDoFormulario(null), null, "null, null");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
