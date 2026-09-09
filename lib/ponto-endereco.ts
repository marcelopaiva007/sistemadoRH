/**
 * Endereço aproximado de uma coordenada de batida ("geocodificação reversa").
 *
 * POR QUE EXISTE. A batida grava latitude/longitude, e coordenada crua não
 * responde a pergunta que o RH faz olhando o histórico — "onde essa pessoa
 * estava?". Abrir o mapa numa aba nova responde, mas uma linha por vez; com 40
 * batidas na tela isso é 40 idas e voltas.
 *
 * O QUE SAI DAQUI PARA FORA. Só a coordenada ARREDONDADA a 4 casas (~11 m),
 * para o serviço público do OpenStreetMap (Nominatim). Nome, CPF, matrícula,
 * empresa e horário NÃO viajam — o serviço recebe um ponto no mapa e devolve
 * um endereço, sem saber de quem é. O arredondamento também é o que faz o
 * cache funcionar: todo mundo que bate na porta da empresa cai na MESMA chave
 * e consulta uma vez só.
 *
 * FALHA PARA O LADO DE NÃO SABER. Serviço fora do ar, tempo esgotado, resposta
 * estranha: devolve null, e a tela mostra a coordenada com link para o mapa,
 * como fazia antes. Endereço é conveniência de leitura; a prova do lugar é a
 * coordenada gravada na batida, que ninguém aqui altera.
 *
 * O cache é de PROCESSO (Map em memória), não do banco. É de propósito: uma
 * tabela nova exigiria migration, e migration pendente reprova o build de
 * Preview da PR (ver prisma/checar-migracoes.mjs) — justamente o ambiente onde
 * esta tela precisa ser conferida. O ganho real do cache é dentro da mesma
 * sessão de consulta, que é onde ele está.
 */

/** Chave do cache: coordenada arredondada a ~11 m. */
export function chaveDeCoordenada(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

type EntradaDeCache = { endereco: string | null; expiraEm: number };

const CACHE = new Map<string, EntradaDeCache>();

// Acerto vale um dia; erro vale 10 minutos. Guardar a falha por muito tempo
// deixaria a tela sem endereço até o processo reiniciar, mesmo depois de o
// serviço voltar; não guardar nada faria cada render tentar de novo, o que é
// exatamente o que a política de uso do Nominatim pede para não fazer.
const TTL_ACERTO_MS = 24 * 60 * 60 * 1000;
const TTL_ERRO_MS = 10 * 60 * 1000;

// Nominatim pede User-Agent identificável e no máximo 1 consulta por segundo.
const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "SistemaRH-SOFTrh/1.0 (modulo de ponto eletronico; contato pelo RH)";
const ESPERA_ENTRE_CONSULTAS_MS = 1100;
const TIMEOUT_MS = 4000;

/**
 * Quantas coordenadas NOVAS uma chamada pode resolver. As já cacheadas não
 * contam. Com espera de ~1,1 s entre consultas, 6 é o teto que mantém a
 * chamada abaixo de ~7 s — acima disso a tela pareceria travada.
 */
const MAXIMO_DE_CONSULTAS_POR_CHAMADA = 6;

function enderecoLegivel(dados: unknown): string | null {
  if (typeof dados !== "object" || dados === null) return null;
  const obj = dados as Record<string, unknown>;

  const a = (obj.address ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  // Monta "Rua, número — Bairro, Cidade/UF" a partir das partes, porque o
  // `display_name` do Nominatim vem com CEP, país e microrregião — cinco
  // linhas de texto para dizer uma esquina.
  const rua = texto(a.road) ?? texto(a.pedestrian) ?? texto(a.footway);
  const numero = texto(a.house_number);
  const bairro = texto(a.suburb) ?? texto(a.neighbourhood) ?? texto(a.city_district);
  const cidade = texto(a.city) ?? texto(a.town) ?? texto(a.village) ?? texto(a.municipality);
  const uf = texto(a.state_code) ?? texto(a["ISO3166-2-lvl4"])?.split("-").pop() ?? null;

  const logradouro = rua ? (numero ? `${rua}, ${numero}` : rua) : null;
  const local = [bairro, cidade && uf ? `${cidade}/${uf}` : cidade].filter(Boolean).join(", ");
  const montado = [logradouro, local].filter(Boolean).join(" — ");
  if (montado) return montado;

  // Sem partes reconhecíveis, o display_name cru ainda é melhor que nada.
  return texto(obj.display_name);
}

async function consultarNominatim(latitude: number, longitude: number): Promise<string | null> {
  const url =
    `${ENDPOINT}?format=jsonv2&zoom=18&addressdetails=1` +
    `&lat=${encodeURIComponent(latitude.toFixed(6))}` +
    `&lon=${encodeURIComponent(longitude.toFixed(6))}`;

  try {
    const resposta = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Sem cache do Next: quem guarda é o Map acima, com TTL próprio.
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    return enderecoLegivel(await resposta.json());
  } catch {
    // Rede caída, DNS, timeout, JSON quebrado: nada disso pode derrubar a tela
    // de histórico. Sem endereço é um estado previsto.
    return null;
  }
}

/**
 * Endereços de um conjunto de coordenadas, já deduplicadas pela chave.
 *
 * Devolve um Map chave -> endereço (ou null quando não deu). Chaves que
 * estouraram o teto de consultas ficam FORA do Map — a tela as trata como
 * "ainda não resolvido" e pode pedir de novo, em vez de exibir "sem endereço"
 * para algo que só não coube nesta rodada.
 */
export async function enderecosDeCoordenadas(
  coordenadas: Array<{ latitude: number; longitude: number }>,
): Promise<Map<string, string | null>> {
  const agora = Date.now();
  const resultado = new Map<string, string | null>();

  // Dedup por chave antes de qualquer rede: 40 batidas na porta da empresa são
  // uma consulta, não 40.
  const pendentes = new Map<string, { latitude: number; longitude: number }>();
  for (const c of coordenadas) {
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
    const chave = chaveDeCoordenada(c.latitude, c.longitude);
    if (resultado.has(chave) || pendentes.has(chave)) continue;

    const emCache = CACHE.get(chave);
    if (emCache && emCache.expiraEm > agora) {
      resultado.set(chave, emCache.endereco);
      continue;
    }
    pendentes.set(chave, c);
  }

  let consultas = 0;
  for (const [chave, coordenada] of pendentes) {
    if (consultas >= MAXIMO_DE_CONSULTAS_POR_CHAMADA) break;
    // A espera vai ANTES da 2ª consulta em diante — a primeira sai na hora.
    if (consultas > 0) {
      await new Promise((r) => setTimeout(r, ESPERA_ENTRE_CONSULTAS_MS));
    }
    consultas++;

    const endereco = await consultarNominatim(coordenada.latitude, coordenada.longitude);
    CACHE.set(chave, {
      endereco,
      expiraEm: Date.now() + (endereco ? TTL_ACERTO_MS : TTL_ERRO_MS),
    });
    resultado.set(chave, endereco);
  }

  return resultado;
}
