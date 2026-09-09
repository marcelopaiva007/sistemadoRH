"use server";

/**
 * Consulta do histórico de marcações de ponto — a aba "Histórico" da tela de
 * Ponto (app/(app)/rh/[empresaId]/ponto/historico-view.tsx).
 *
 * Duas actions, ambas SÓ LEITURA. Nenhuma delas grava, decide ou altera
 * marcação: a batida do REP-P é imutável por desenho (ver lib/ponto-historico.ts).
 *
 * Arquivo separado de app/actions/rh-ponto.ts de propósito: aquele é o das
 * ESCRITAS do módulo (tratamento, PIN, jornada, configuração) e já passa de mil
 * linhas. Misturar a consulta ali faria a próxima pessoa procurar a regra de
 * gravação no meio de um SELECT.
 */

import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { dataHoraDoFormularioBrasilia } from "@/lib/datas";
import { TIPOS_MARCACAO_VALIDOS } from "@/lib/constants-ponto";
import {
  historicoDeMarcacoes,
  LIMITE_PADRAO_HISTORICO,
  type MarcacaoDoHistorico,
} from "@/lib/ponto-historico";
import { chaveDeCoordenada, enderecosDeCoordenadas } from "@/lib/ponto-endereco";

/** Teto de dias por consulta. Um trimestre é o que a apuração costuma revisar. */
const MAXIMO_DE_DIAS = 92;

export type ResultadoDoHistorico = {
  marcacoes: MarcacaoDoHistorico[];
  /** Bateu no teto de linhas: há mais coisa fora da tela do que dentro. */
  truncado: boolean;
  erro?: string;
};

/**
 * A janela [de, ate) em instantes UTC a partir de dois dias de BRASÍLIA
 * ("aaaa-mm-dd" do `<input type="date">`).
 *
 * `ate` é o dia seguinte à meia-noite: o filtro é `lt`, então o último dia
 * escolhido entra INTEIRO. Sem isso, escolher "até 09/09" perderia todas as
 * batidas do dia 09 — o erro clássico de intervalo fechado à direita.
 */
function janelaDaConsulta(de: string, ate: string): { de: Date; ate: Date } | null {
  const inicio = dataHoraDoFormularioBrasilia(`${de}T00:00`);
  const fimDoDiaEscolhido = dataHoraDoFormularioBrasilia(`${ate}T00:00`);
  if (!inicio || !fimDoDiaEscolhido) return null;
  const fim = new Date(fimDoDiaEscolhido.getTime() + 24 * 60 * 60 * 1000);
  if (fim <= inicio) return null;
  return { de: inicio, ate: fim };
}

export async function listarHistoricoDeMarcacoes(input: {
  empresaId: string;
  /** "aaaa-mm-dd" (dia de Brasília). */
  de: string;
  ate: string;
  colaboradorId?: string;
  tipo?: string;
}): Promise<ResultadoDoHistorico> {
  // A MESMA guarda das páginas do módulo: escopo de empresa conferido no
  // servidor. Uma action é endpoint POST público — a aba só aparecer para quem
  // tem acesso não protege nada.
  await requireEmpresaAccess(input.empresaId);

  const janela = janelaDaConsulta(input.de, input.ate);
  if (!janela) {
    return { marcacoes: [], truncado: false, erro: "Período inválido. Confira as datas." };
  }

  const dias = Math.round((janela.ate.getTime() - janela.de.getTime()) / (24 * 60 * 60 * 1000));
  if (dias > MAXIMO_DE_DIAS) {
    return {
      marcacoes: [],
      truncado: false,
      erro: `Período muito longo (${dias} dias). Consulte no máximo ${MAXIMO_DE_DIAS} dias por vez.`,
    };
  }

  // `tipo` chega do cliente como string qualquer numa chamada direta à action.
  // Valor fora dos quatro conhecidos vira "sem filtro" em vez de um WHERE que
  // não casa com nada — lista vazia sem explicação é pior que lista completa.
  const tipo = input.tipo && TIPOS_MARCACAO_VALIDOS.has(input.tipo) ? input.tipo : undefined;

  // colaboradorId só filtra se for DESTA empresa. Sem esta conferência, um id
  // de outro CNPJ simplesmente devolveria vazio — o que é seguro, mas o
  // `empresaId` no WHERE do leitor já garante isso. A checagem existe para a
  // tela poder dizer "esse colaborador não é desta empresa" em vez de mentir
  // "essa pessoa não bateu ponto no período".
  let colaboradorId: string | undefined;
  if (input.colaboradorId) {
    const existe = await prisma.colaborador.findFirst({
      where: { id: input.colaboradorId, empresaId: input.empresaId },
      select: { id: true },
    });
    if (!existe) {
      return { marcacoes: [], truncado: false, erro: "Colaborador não encontrado nesta empresa." };
    }
    colaboradorId = existe.id;
  }

  const { marcacoes, truncado } = await historicoDeMarcacoes(prisma, {
    empresaId: input.empresaId,
    de: janela.de,
    ate: janela.ate,
    colaboradorId,
    tipo,
    limite: LIMITE_PADRAO_HISTORICO,
  });

  return { marcacoes, truncado };
}

/**
 * Endereços aproximados das batidas pedidas, por id.
 *
 * Chamada DEPOIS da listagem, pela tela, e só para as linhas que estão à
 * vista. Separada de propósito: a geocodificação reversa fala com um serviço
 * externo (ver lib/ponto-endereco.ts) e pode levar segundos — pendurá-la na
 * listagem faria a tabela inteira esperar por um enfeite. Assim a tabela
 * aparece na hora e os endereços chegam depois.
 *
 * Recebe IDS, não coordenadas: as coordenadas são lidas do banco, dentro do
 * escopo da empresa. Aceitar coordenada do cliente transformaria esta action
 * num serviço de geocodificação aberto a quem tem sessão.
 */
export async function enderecosDasMarcacoes(input: {
  empresaId: string;
  ids: string[];
}): Promise<Record<string, string>> {
  await requireEmpresaAccess(input.empresaId);

  const ids = input.ids.slice(0, 100);
  if (ids.length === 0) return {};

  const batidas = await prisma.registroPonto.findMany({
    where: { id: { in: ids }, empresaId: input.empresaId },
    select: { id: true, latitude: true, longitude: true },
  });

  const comCoordenada = batidas.filter(
    (b): b is typeof b & { latitude: number; longitude: number } =>
      b.latitude !== null && b.longitude !== null,
  );
  if (comCoordenada.length === 0) return {};

  const porChave = await enderecosDeCoordenadas(
    comCoordenada.map((b) => ({ latitude: b.latitude, longitude: b.longitude })),
  );

  // Só o que TEM endereço volta. Chave ausente no Map = não resolvida nesta
  // rodada (estourou o teto de consultas); chave presente com null = o serviço
  // respondeu e não conhece o ponto. Nos dois casos a tela mostra a
  // coordenada — mas no primeiro ela pode pedir de novo, e é por isso que a
  // ausência não vira string vazia aqui.
  const saida: Record<string, string> = {};
  for (const b of comCoordenada) {
    const endereco = porChave.get(chaveDeCoordenada(b.latitude, b.longitude));
    if (endereco) saida[b.id] = endereco;
  }
  return saida;
}
