/**
 * Script de testes unitários e de integração das regras legais de Ponto Eletrônico (CLT & MTP 671/2021)
 */

import {
  aplicarToleranciaCLT,
  calcularMinutosNoturnosFictos,
  horaParaMinutos,
  apurarJornadaDiaria,
  calcularReflexoDSR,
  HorarioContratual,
  BatidaPonto,
} from "../lib/ponto-regras";
import {
  gerarHashPontoSHA256,
  validarIpPonto,
  validarGeofencingGps,
} from "../lib/ponto-seguranca";
import { gerarConteudoAFD } from "../lib/ponto-afdaej";

function testar() {
  console.log("=== INICIANDO TESTES DO MOTOR DE PONTO ELETRÔNICO (REP-P) ===\n");

  // 1. Teste de Tolerância CLT (Art. 58 § 1º)
  console.log("1. Testando Tolerância CLT (Art. 58 § 1º):");
  const tol1 = aplicarToleranciaCLT(8, 10);
  console.assert(tol1 === 0, `Esperado 0 min, obtido ${tol1}`);
  console.log(" - 8 min de atraso/extra (<= 10 min) -> Tolerado (0 min)");

  const tol2 = aplicarToleranciaCLT(12, 10);
  console.assert(tol2 === 12, `Esperado 12 min, obtido ${tol2}`);
  console.log(" - 12 min de atraso/extra (> 10 min) -> Computado integral (12 min)");

  // 2. Teste de Hora Noturna Ficta (Art. 73 § 1º)
  console.log("\n2. Testando Hora Noturna Ficta (Art. 73):");
  const noturnoFicto = calcularMinutosNoturnosFictos(420); // 7 horas reais (22h às 05h) = 420 min
  // 420 * (60 / 52.5) = 480 minutos fictos (8 horas)
  console.assert(noturnoFicto === 480, `Esperado 480 min fictos, obtido ${noturnoFicto}`);
  console.log(" - 7 horas reais noturnas (420 min) -> 8 horas fictas convertidas (480 min)");

  // 3. Teste de Apuração de Jornada Padrão (8h diárias)
  console.log("\n3. Testando Apuração de Jornada Diária:");
  const contrato: HorarioContratual = {
    entrada1: "08:00",
    saida1: "12:00",
    entrada2: "13:00",
    saida2: "17:00",
    cargaDiariaMin: 480, // 8h
    toleranciaMin: 10,
  };

  const batidasNormal: BatidaPonto[] = [
    { tipo: "ENTRADA_1", dataHora: new Date("2026-08-10T08:00:00Z") },
    { tipo: "SAIDA_1", dataHora: new Date("2026-08-10T12:00:00Z") },
    { tipo: "ENTRADA_2", dataHora: new Date("2026-08-10T13:00:00Z") },
    { tipo: "SAIDA_2", dataHora: new Date("2026-08-10T17:00:00Z") },
  ];

  const resultadoNormal = apurarJornadaDiaria(batidasNormal, contrato);
  console.assert(resultadoNormal.minutosTrabalhadosBruto === 480, "Erro minutos trabalhados");
  console.assert(resultadoNormal.saldoBancoHorasMin === 0, "Erro saldo banco de horas");
  console.log(" - Jornada normal 8h -> Saldo Banco de Horas: 0 min");

  // 4. Teste de Apuração de Hora Extra (50%)
  const batidasHE: BatidaPonto[] = [
    { tipo: "ENTRADA_1", dataHora: new Date("2026-08-10T08:00:00Z") },
    { tipo: "SAIDA_1", dataHora: new Date("2026-08-10T12:00:00Z") },
    { tipo: "ENTRADA_2", dataHora: new Date("2026-08-10T13:00:00Z") },
    { tipo: "SAIDA_2", dataHora: new Date("2026-08-10T18:30:00Z") }, // 1h30m extra
  ];

  const resultadoHE = apurarJornadaDiaria(batidasHE, contrato);
  console.assert(resultadoHE.minutosHoraExtra50 === 90, "Erro cálculo H.E 50%");
  console.log(" - Trabalhado 9h30m -> 90 min Hora Extra 50%");

  // 5. Teste de Segurança (Hash SHA-256 e Geofencing)
  console.log("\n4. Testando Segurança e Validação de GPS/IP:");
  const hash = gerarHashPontoSHA256({
    nsr: 1001,
    colaboradorId: "colab-123",
    empresaId: "emp-456",
    dataHoraISO: "2026-08-10T08:00:00.000Z",
    tipo: "ENTRADA_1",
    ipOrigem: "192.168.1.1",
    latitude: -23.55052,
    longitude: -46.633308,
  });
  console.assert(hash.length === 64, "Erro no tamanho do Hash SHA-256");
  console.log(` - Hash SHA-256 gerado com sucesso: ${hash.slice(0, 16)}...`);

  const ipValido = validarIpPonto("192.168.1.5", "192.168.1.1, 192.168.1.5");
  console.assert(ipValido === true, "Erro validação de IP");
  console.log(" - Validação de IP Autorizado -> OK");

  const gpsRes = validarGeofencingGps(-23.55052, -46.633308, -23.55060, -46.63335, 200);
  console.assert(gpsRes.valido === true, "Erro Geofencing GPS");
  console.log(` - Geofencing GPS (Distância: ${gpsRes.distanciaMetros}m <= 200m) -> OK`);

  // FORA do raio: ~1° de longitude ≈ 100 km. É este o caminho que bloqueia a
  // batida quando a cerca está ligada — o teste de dentro do raio sozinho não
  // pegaria uma Haversine quebrada que respondesse sempre "válido".
  const gpsFora = validarGeofencingGps(-23.55052, -47.633308, -23.55060, -46.63335, 200);
  console.assert(gpsFora.valido === false, "Erro Geofencing GPS fora do raio");
  console.assert(gpsFora.distanciaMetros > 90_000, "Distância fora do raio implausível");
  console.log(` - Geofencing GPS fora do raio (${gpsFora.distanciaMetros}m > 200m) -> recusado, OK`);

  // Sem cerca cadastrada (empresa sem coordenadas), qualquer posição vale —
  // é o que faz a cerca ser opcional por empresa.
  const gpsSemCerca = validarGeofencingGps(-23.55052, -46.633308, null, null, 200);
  console.assert(gpsSemCerca.valido === true, "Erro Geofencing sem cerca cadastrada");
  console.log(" - Geofencing sem cerca cadastrada -> não bloqueia, OK");

  // 6. Teste de Arquivo Fiscal AFD (Portaria 671)
  console.log("\n5. Testando Gerador de AFD (Portaria MTP 671/2021):");
  // 11:00Z é 08:00 em Brasília. O arquivo fiscal precisa dizer 08:00 — é o
  // horário em que a pessoa bateu, e é o que a fiscalização confere contra a
  // jornada. Até 12/08/2026 saía 11:00: o gerador usava getHours(), que
  // responde no fuso do processo, e o processo roda em UTC na Vercel.
  //
  // Este teste passava mesmo com o erro, porque só conferia se o CPF e o CNPJ
  // apareciam em algum lugar do texto. Um teste que não olha o campo que
  // importa não protege o campo que importa.
  const afdTexto = gerarConteudoAFD(
    { razaoSocial: "EMPRESA TESTE LTDA", cnpj: "12.345.678/0001-90" },
    [
      {
        nsr: 1,
        tipo: "ENTRADA_1",
        dataHora: new Date("2026-08-10T11:00:00Z"),
        cpfColaborador: "123.456.789-00",
        hashSHA256: hash,
      },
    ]
  );
  console.assert(afdTexto.includes("12345678000190"), "Erro CNPJ no AFD");
  console.assert(afdTexto.includes("12345678900"), "Erro CPF no AFD");

  // Linha tipo 3: NSR(9) + "3" + DDMMAAAA(8) + HHMM(4) + CPF(11)
  const linhaMarcacao = afdTexto.split("\r\n")[1];
  const dataNoAfd = linhaMarcacao.slice(10, 18);
  const horaNoAfd = linhaMarcacao.slice(18, 22);
  console.assert(dataNoAfd === "10082026", `Erro data no AFD: ${dataNoAfd} (esperado 10082026)`);
  console.assert(horaNoAfd === "0800", `Erro hora no AFD: ${horaNoAfd} (esperado 0800, Brasília)`);
  console.log(` - AFD grava no horário de Brasília (${dataNoAfd} ${horaNoAfd}) -> OK`);

  // Meia-noite em Brasília cai no dia seguinte em UTC. Sem fuso explícito, a
  // marcação das 23:30 de um dia era gravada com a data do dia seguinte.
  const afdVirada = gerarConteudoAFD(
    { razaoSocial: "EMPRESA TESTE LTDA", cnpj: "12345678000190" },
    [
      {
        nsr: 2,
        tipo: "SAIDA_2",
        // 02:30Z do dia 11 = 23:30 do dia 10 em Brasília.
        dataHora: new Date("2026-08-11T02:30:00Z"),
        cpfColaborador: "12345678900",
        hashSHA256: hash,
      },
    ]
  );
  const linhaVirada = afdVirada.split("\r\n")[1];
  console.assert(
    linhaVirada.slice(10, 22) === "100820262330",
    `Erro na virada do dia: ${linhaVirada.slice(10, 22)} (esperado 100820262330)`,
  );
  console.log(" - AFD na virada do dia (23:30 de Brasília) mantém a data certa -> OK");

  console.log("\n=== TODOS OS TESTES PASSARAM COM SUCESSO ===");
}

testar();
