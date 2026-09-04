"use server";

import { prisma } from "@/lib/prisma";
import { violouUnique } from "@/lib/prisma-erros";
import {
  apurarLimiteEstagio,
  avisoDeLimiteEstagio,
  jaBateuHoje,
  limitesDeEstagio,
  type BatidaPonto,
} from "@/lib/ponto-regras";
import { resolverIdentidadeDePonto } from "@/lib/ponto-identidade";
import { gerarHashPontoSHA256, validarIpPonto, validarGeofencingGps } from "@/lib/ponto-seguranca";
import {
  LIMITE_FOTO_DATA_URL,
  REGEX_FOTO_DATA_URL,
  fotoDeBatidaValida,
} from "@/lib/ponto-foto";
import { enviarParaBlob } from "@/lib/blob";
import { janelaDoDiaBrasilia } from "@/lib/datas";
import { marcacoesDaJornada } from "@/lib/ponto-jornada";
import { revalidatePath } from "next/cache";

import { headers } from "next/headers";
import { ipDaRequisicao } from "@/lib/login-tentativas";

// A validação da foto obrigatória (fotoDeBatidaValida) mudou-se para
// lib/ponto-foto.ts em 20/08/2026: módulo "use server" só exporta função
// async, e a regra precisa ser exportável para o teste de guarda
// (scripts/test-ponto-foto.ts). A revisão do mesmo dia também a endureceu —
// a versão daqui aceitava base64 que decodifica para 0 bytes ou lixo, que
// registrava batida "sem foto" (ou com "foto" que não abre) por chamada
// direta à action; agora os magic bytes do formato são conferidos.

// Nome de cada marcação em português, para a recusa dizer o que a pessoa vê no
// botão em vez de "SAIDA_2".
const ROTULO_DA_MARCACAO: Record<RegistrarPontoInput["tipo"], string> = {
  ENTRADA_1: "Entrada",
  SAIDA_1: "Saída para o intervalo",
  ENTRADA_2: "Volta do intervalo",
  SAIDA_2: "Saída",
};

const rotuloDaMarcacao = (tipo: RegistrarPontoInput["tipo"]) => ROTULO_DA_MARCACAO[tipo];

// Guarda a selfie da batida no Blob privado e devolve a URL — ou null.
//
// NUNCA lança e nunca devolve erro. Desde 20/08/2026 a foto é obrigatória e a
// ausência dela é recusada ANTES, por fotoDeBatidaValida — quando o fluxo
// chega aqui a pessoa JÁ tirou a foto. O que esta função ainda engole é falha
// de infraestrutura (Blob fora do ar, token ausente): nesse caso o ponto
// registra do mesmo jeito e a linha fica "sem foto" no painel do RH, porque
// bloquear a obrigação legal da jornada por causa de um serviço de arquivo
// puniria quem fez a parte dele.
//
// Antes desta função o `fotoBase64` ia INTEIRO para a coluna `fotoUrl` do
// Postgres — o exato caminho que lib/blob.ts existe para evitar (banco de
// 18 MB virando GB). Nenhuma tela enviava foto ainda, então nenhuma linha
// antiga tem base64 salvo — mas a rota que serve a foto trata esse caso
// mesmo assim, porque a coluna aceitava.
// `referencia` compõe o nome do arquivo no Blob. Era o NSR até 13/08/2026,
// quando o NSR passou a ser atribuído dentro do laço de tentativa do insert —
// não existe mais no momento do upload. O instante da batida identifica igual
// e não colide: duas batidas do mesmo colaborador no mesmo milissegundo não
// acontecem, e o vínculo verdadeiro é a coluna `fotoUrl` da linha, não o nome.
async function guardarFotoDaBatida(params: {
  empresaId: string;
  colaboradorId: string;
  referencia: string;
  tipo: string;
  fotoBase64: string | null | undefined;
}): Promise<string | null> {
  const dataUrl = params.fotoBase64;
  if (!dataUrl || dataUrl.length > LIMITE_FOTO_DATA_URL) return null;

  // A mesma regex da validação de entrada — ver REGEX_FOTO_DATA_URL acima.
  const casado = REGEX_FOTO_DATA_URL.exec(dataUrl);
  if (!casado) return null;

  const ehPng = casado[1] === "png";

  try {
    const bytes = new Uint8Array(Buffer.from(casado[2], "base64"));
    if (bytes.byteLength === 0) return null;
    const envio = await enviarParaBlob({
      empresaId: params.empresaId,
      colaboradorId: params.colaboradorId,
      nome: `ponto-${params.referencia}-${params.tipo}.${ehPng ? "png" : "jpg"}`,
      mimeType: ehPng ? "image/png" : "image/jpeg",
      bytes,
    });
    return envio.ok ? envio.url : null;
  } catch {
    return null;
  }
}

export type RegistrarPontoInput = {
  tipo: "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";
  latitude?: number | null;
  longitude?: number | null;
  precisaoGps?: number | null;
  fotoBase64?: string | null;
  dispositivoInfo?: string | null;
};

export async function registrarPontoPortal(input: RegistrarPontoInput) {
  const headersList = await headers();
  // O IP de quem está batendo sai de ipDaRequisicao (lib/login-tentativas.ts),
  // a MESMA leitura do login. Pegar o PRIMEIRO valor do x-forwarded-for era
  // pegar o que o CLIENTE mandou: com a trava de IP ligada, um POST direto
  // com "X-Forwarded-For: <ip-da-empresa>" passava de qualquer rede, e o
  // ipOrigem forjado ainda entrava na cadeia do SHA-256 do registro imutável.
  // Agora a fonte primária é o x-real-ip (preenchido pela Vercel, o cliente
  // não sobrescreve); sem ele, o ÚLTIMO valor do x-forwarded-for — o hop
  // anexado pela infra, não a ponta forjável; sem nada, "desconhecido", que
  // nenhuma lista de IPs autorizados contém: falha fechado, não aberto.
  const ipCliente = ipDaRequisicao(headersList);

  // Aceita as DUAS portas de bater ponto — portal via Telegram e app /ponto
  // via PIN. A regra de quem entra vive só em lib/ponto-identidade.ts.
  const identidade = await resolverIdentidadeDePonto();
  if (!identidade) {
    return { erro: "Sessão inválida ou expirada. Entre de novo para bater o ponto." };
  }

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: identidade.colaboradorId },
    // `fotoUrl` entra para saber se esta pessoa já tem foto de referência —
    // se não tiver, a selfie desta batida vira a referência (ver adiante).
    select: { id: true, empresaId: true, ativo: true, pontoLiberado: true, fotoUrl: true, tipoContrato: true },
  });

  if (!colaborador || !colaborador.ativo) {
    return { erro: "Colaborador não localizado ou inativo." };
  }

  // Trava por pessoa, não só por empresa (ver ConfiguracaoPontoEmpresa mais
  // abaixo): esconder o card no portal não basta, porque esta action é
  // endpoint POST público — uma chamada direta continuaria registrando sem
  // esta checagem.
  if (!colaborador.pontoLiberado) {
    return { erro: "Seu acesso ao ponto eletrônico ainda não foi liberado pelo RH." };
  }

  // Foto obrigatória (20/08/2026, pedido do RH): confirma quem bateu e onde.
  // A checagem fica ANTES das consultas de configuração e histórico — recusa
  // barata primeiro — e vale para as duas portas (portal e app /ponto), que
  // usam esta mesma action. Ver fotoDeBatidaValida para o porquê de a regra
  // morar no servidor.
  if (!fotoDeBatidaValida(input.fotoBase64)) {
    return {
      erro: "A foto é obrigatória para registrar o ponto. Toque em “Tirar a foto” e tente de novo.",
    };
  }

  // Buscar configurações de ponto da empresa
  const config = await prisma.configuracaoPontoEmpresa.findUnique({
    where: { empresaId: colaborador.empresaId },
  });

  // Validação de IP
  const ipValido = validarIpPonto(ipCliente, config?.ipsAutorizados);
  if (config?.exigirIp && !ipValido) {
    // Diz o caminho de volta: quase sempre o celular está no 4G/5G da
    // operadora em vez do Wi-Fi da empresa — e é isso que a pessoa conserta.
    return {
      erro: "Sua conexão está fora da rede autorizada da empresa. Conecte o celular ao Wi-Fi da empresa (desligue os dados móveis) e tente de novo.",
    };
  }

  // Validação de GPS Geofencing.
  //
  // `typeof === "number" && isFinite`, não truthiness: coordenada 0 é lugar
  // válido (linha do Equador/Greenwich) e `if (input.latitude)` a tratava como
  // ausente; NaN vindo de chamada direta à action passava como presente. O
  // raio usa `??` e não `||`: são semânticas diferentes para raio 0 gravado
  // por fora — com `||` ele virava 200 em silêncio.
  const raioPermitido = config?.raioPermitidoMtrs ?? 200;
  // "Tem cerca" é ter as DUAS coordenadas — é o mesmo critério de
  // validarGeofencingGps, que devolve `valido: true` quando falta qualquer
  // metade. Sem cerca não existe raio de onde estar fora, e exigir GPS aqui só
  // impediria de bater ponto quem negou a localização no celular, sem validar
  // lugar nenhum. Trava de exigência anda com a cerca, não sozinha.
  const temCercaCadastrada =
    config?.latitudeEmpresa !== null &&
    config?.latitudeEmpresa !== undefined &&
    config?.longitudeEmpresa !== null &&
    config?.longitudeEmpresa !== undefined;
  const temCoordenada =
    typeof input.latitude === "number" &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.longitude);
  let gpsValido = true;
  let distanciaMetros: number | null = null;
  if (temCoordenada) {
    const resGps = validarGeofencingGps(
      input.latitude as number,
      input.longitude as number,
      config?.latitudeEmpresa,
      config?.longitudeEmpresa,
      raioPermitido
    );
    gpsValido = resGps.valido;
    distanciaMetros = resGps.distanciaMetros;
  } else if (config?.exigirGps && temCercaCadastrada) {
    return {
      erro: "Sua localização (GPS) é obrigatória para registrar o ponto. Ative a localização do aparelho, permita o acesso para este site e tente de novo.",
    };
  }

  if (config?.exigirGps && !gpsValido) {
    // A distância entra na mensagem de propósito: "fora do raio" seco não diz
    // se a pessoa está na esquina ou com o GPS doido a 30 km — e é essa
    // diferença que decide se ela caminha até a empresa ou chama o RH.
    return {
      erro: `Você está a cerca de ${distanciaMetros} m da empresa — fora do raio de ${raioPermitido} m permitido para bater o ponto. Aproxime-se do local de trabalho e tente de novo.`,
    };
  }

  // A partir daqui só existem coordenadas saneadas: meia coordenada ou NaN
  // vira null no hash e na linha gravada — "NaN".toFixed(6) entraria na cadeia
  // do SHA-256 e um Float NaN no Postgres não serve para auditoria nenhuma.
  const latitude = temCoordenada ? (input.latitude as number) : null;
  const longitude = temCoordenada ? (input.longitude as number) : null;
  const precisaoGps =
    typeof input.precisaoGps === "number" && Number.isFinite(input.precisaoGps)
      ? input.precisaoGps
      : null;

  const dataHoraAtual = new Date();

  // Esta marcação já foi feita hoje? Ver jaBateuHoje — a trava existia só no
  // botão da tela, e action "use server" é endpoint público.
  //
  // A janela de 48h cobre o dia de Brasília inteiro sem depender de calcular
  // fronteira em UTC: o dia certo é decidido em JS, comparando chaves de dia.
  // São poucas linhas por colaborador, então a consulta é barata.
  //
  // Fica ANTES do upload da foto de propósito: batida recusada não pode deixar
  // selfie órfã no Blob.
  //
  // A janela é de 8 dias, e não de 48h, porque o teto do estagiário é semanal:
  // a semana começa na segunda, e uma marcação de segunda-feira precisa estar
  // aqui quando a de domingo chega. Para a trava de repetição, sobra histórico.
  //
  // Desde 04/09/2026 a lista é a UNIÃO de batidas (RegistroPonto) e marcações
  // incluídas por tratamento aprovado (rh.MarcacaoTratada) — lib/ponto-jornada.ts.
  // Sem isso, quem teve a ENTRADA_1 incluída pelo RH batia ENTRADA_1 de novo e
  // duplicava a jornada; e o teto do estagiário não via as horas tratadas.
  // O fim da janela é o fim do dia de Brasília de hoje, não "agora": uma
  // marcação incluída para mais tarde hoje já trava o botão daquele tipo.
  // `tipo` é String no leitor; o cast fecha o tipo para as regras de
  // lib/ponto-regras.ts, que só conhecem as quatro marcações.
  const batidasRecentes: BatidaPonto[] = (
    await marcacoesDaJornada(prisma, {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      de: new Date(dataHoraAtual.getTime() - 8 * 24 * 60 * 60 * 1000),
      ate: janelaDoDiaBrasilia(dataHoraAtual).fim,
    })
  ).map((m) => ({ tipo: m.tipo as BatidaPonto["tipo"], dataHora: m.dataHora }));

  if (jaBateuHoje(batidasRecentes, input.tipo, dataHoraAtual)) {
    return { erro: `Você já registrou "${rotuloDaMarcacao(input.tipo)}" hoje.` };
  }

  // Teto de jornada do estagiário — AVISA, NÃO BLOQUEIA. Ver
  // avisoDeLimiteEstagio: recusar a saída deixaria a pessoa sem registro da
  // hora em que foi embora, que é o oposto do que um controle de ponto serve.
  //
  // O cálculo entra aqui e não depois do insert porque a marcação atual não
  // precisa estar gravada: um período aberto conta até agora.
  //
  // Os limites vêm da configuração da empresa (Ponto → Configurações), e
  // `limitesDeEstagio` trunca no teto legal ao ler — coluna adulterada por fora
  // da tela não afrouxa a regra.
  const avisoEstagio =
    colaborador.tipoContrato === "ESTAGIO"
      ? (() => {
          const limites = limitesDeEstagio(config);
          return avisoDeLimiteEstagio(
            apurarLimiteEstagio(batidasRecentes, dataHoraAtual, limites),
            limites,
          );
        })()
      : null;

  // A foto vai para o Blob privado ANTES do create, para a URL entrar na
  // mesma linha. Falha aqui não impede nada — ver guardarFotoDaBatida.
  //
  // Fica FORA do laço de tentativa do NSR de propósito: a foto não depende do
  // número, e reenviar a mesma selfie a cada colisão deixaria cópias órfãs no
  // Blob, que ninguém apaga.
  const fotoUrl = await guardarFotoDaBatida({
    empresaId: colaborador.empresaId,
    colaboradorId: colaborador.id,
    referencia: String(dataHoraAtual.getTime()),
    tipo: input.tipo,
    fotoBase64: input.fotoBase64,
  });

  // Primeira selfie de quem ainda não tem foto de referência vira a
  // referência, marcada como NÃO CONFERIDA.
  //
  // POR QUE AUTOMÁTICO. A conferência humana precisa de algo com que comparar,
  // e esperar o RH reunir 170 fotos deixaria a conferência sem funcionar por
  // semanas. Assim a cobertura começa na primeira batida de cada um.
  //
  // POR QUE "NÃO CONFERIDA". Se justamente esta primeira batida tiver sido
  // feita por outra pessoa, a referência nasce errada e passaria a validar a
  // fraude para sempre. O painel marca isso e o RH confirma (ou substitui) com
  // um clique — o risco fica visível em vez de escondido.
  //
  // Best-effort: falhar aqui não pode derrubar a batida, que é a obrigação
  // legal. Sem referência hoje, a próxima batida tenta de novo.
  if (fotoUrl && !colaborador.fotoUrl) {
    try {
      await prisma.colaborador.update({
        where: { id: colaborador.id },
        data: { fotoUrl, fotoConferidaPeloRh: false },
      });
    } catch {
      /* silêncio proposital — ver comentário acima */
    }
  }

  // Criar RegistroPonto (Append-Only), com o NSR resolvido a cada tentativa.
  //
  // O NSR é "maior da empresa + 1", e ler-depois-escrever é corrida: entre a
  // consulta e o insert cabe outra batida. Até 13/08/2026 as duas gravavam com
  // o MESMO número, porque a tabela só tinha índice comum em (empresaId, nsr).
  // NSR repetido é arquivo AFD malformado — o NSR identifica a linha no arquivo
  // entregue à fiscalização (Portaria MTP 671/2021).
  //
  // Agora existe índice ÚNICO (migração 20260813180000): a segunda gravação é
  // recusada pelo banco em vez de aceita. É o banco que garante — nenhuma
  // lógica de aplicação resolve corrida sozinha.
  //
  // Daí o laço: recusa não pode virar "não consegui bater o ponto". Cada volta
  // relê o maior NSR e tenta de novo. O hash entra aqui dentro porque o NSR é o
  // primeiro campo da cadeia — número novo, hash novo.
  //
  // Cinco tentativas: cada colisão significa outra batida ganhando a corrida, e
  // cinco perdas seguidas na mesma empresa já não é concorrência normal.
  const TENTATIVAS = 5;
  let novoRegistro = null as Awaited<ReturnType<typeof prisma.registroPonto.create>> | null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const ultimoPonto = await prisma.registroPonto.findFirst({
      where: { empresaId: colaborador.empresaId },
      orderBy: { nsr: "desc" },
      select: { nsr: true },
    });
    const nsr = (ultimoPonto?.nsr ?? BigInt(0)) + BigInt(1);

    const hashSHA256 = gerarHashPontoSHA256({
      nsr,
      colaboradorId: colaborador.id,
      empresaId: colaborador.empresaId,
      dataHoraISO: dataHoraAtual.toISOString(),
      tipo: input.tipo,
      ipOrigem: ipCliente,
      latitude,
      longitude,
    });

    try {
      novoRegistro = await prisma.registroPonto.create({
        data: {
          empresaId: colaborador.empresaId,
          colaboradorId: colaborador.id,
          dataHora: dataHoraAtual,
          tipo: input.tipo,
          nsr,
          ipOrigem: ipCliente,
          ipValido,
          latitude,
          longitude,
          precisaoGps,
          gpsValido,
          fotoUrl,
          hashSHA256,
          dispositivoInfo: input.dispositivoInfo || null,
        },
      });
      break;
    } catch (e) {
      // Só a violação DESTE índice conta como corrida. Sem o nome, qualquer
      // P2002 da linha viraria "tente de novo" — inclusive um que repetisse
      // para sempre. Qualquer outro erro é problema de verdade e sobe.
      if (!violouUnique(e, "RegistroPonto_empresaId_nsr_key")) throw e;
      if (tentativa === TENTATIVAS) {
        return {
          erro: "O sistema está recebendo muitas marcações ao mesmo tempo. Tente de novo em alguns segundos.",
        };
      }
    }
  }

  if (!novoRegistro) {
    return { erro: "Não foi possível registrar o ponto. Tente de novo." };
  }

  revalidatePath(identidade.origem === "PIN" ? "/ponto" : "/portal");

  return {
    sucesso: true,
    comprovante: {
      nsr: Number(novoRegistro.nsr),
      dataHora: novoRegistro.dataHora.toISOString(),
      tipo: novoRegistro.tipo,
      hashSHA256: novoRegistro.hashSHA256,
      // O comprovante diz se a foto entrou: quem bateu precisa saber na hora
      // se vai aparecer "sem foto" para o RH — e não descobrir depois.
      comFoto: fotoUrl !== null,
    },
    // Vem JUNTO com o comprovante, nunca no lugar dele: a marcação valeu.
    aviso: avisoEstagio,
  };
}

export async function buscarRegistrosPontoHojePortal() {
  const identidade = await resolverIdentidadeDePonto();
  if (!identidade) return [];

  // O dia é o de BRASÍLIA, não o do processo — ver janelaDoDiaBrasilia.
  //
  // Com `setHours(0, 0, 0, 0)` (UTC na Vercel) a janela ia das 21:00 de ontem
  // às 20:59 de hoje, em BRT. Quem batia às 21:30 recebia lista VAZIA: os
  // quatro botões voltavam a ficar livres e ENTRADA_1 aparecia destacada como
  // sugerida — aí o servidor recusava com "Você já registrou Entrada hoje",
  // porque jaBateuHoje compara por diaBrasilia e estava certo. Entre 00:00 e
  // 02:59 o efeito era o inverso: as marcações de ONTEM apareciam como as de
  // hoje, e os botões nasciam travados em "Registrado".
  const { inicio: hojeInicio, fim: amanhaInicio } = janelaDoDiaBrasilia();

  // marcacoesDaJornada filtra por empresa; a identidade só traz o colaborador.
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: identidade.colaboradorId },
    select: { empresaId: true },
  });
  if (!colaborador) return [];

  // União de batidas e marcações incluídas por tratamento aprovado (ver
  // lib/ponto-jornada.ts). A lista do dia é o que trava os botões do card —
  // a ENTRADA_1 incluída pelo RH precisa estar aqui, senão o botão fica livre
  // e a pessoa registra a mesma marcação de novo. O shape do retorno não
  // muda; para a marcação tratada, nsr = 0 (ela não consome NSR) e o hash é o
  // dela. `ate` é exclusivo: a janela é [00:00 de hoje, 00:00 de amanhã).
  const marcacoes = await marcacoesDaJornada(prisma, {
    empresaId: colaborador.empresaId,
    colaboradorId: identidade.colaboradorId,
    de: hojeInicio,
    ate: amanhaInicio,
  });

  return marcacoes.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    dataHora: m.dataHora,
    nsr: m.nsr === null ? 0 : Number(m.nsr),
    hashSHA256: m.hashSHA256,
    origem: m.origem,
  }));
}
