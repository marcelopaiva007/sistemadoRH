// Transferência entre CNPJs do grupo (v1.184.0).
//
// A pessoa que muda de CNPJ fica com DUAS fichas: a antiga, encerrada, e a
// nova, ativa (Colaborador é @@unique([empresaId, cpf]) e 33 tabelas escopam
// por empresaId — mover a ficha de empresa não é opção). Até aqui a ficha
// antiga só podia ser encerrada como "Desligado", com um motivo de rescisão
// que não aconteceu, e a varredura de duplicatas tratava o par como cadastro
// em dobro. O motivo TRANSFERENCIA_GRUPO + `transferidoParaEmpresaId` dão
// nome ao caso: a ficha antiga aparece como "Transferido", com o CNPJ de
// destino, e a data da transferência é a própria `dataDesligamento`.
//
// O destino NÃO é escolhido numa lista: é o CNPJ onde existe a ficha ATIVA com
// o mesmo CPF. Isso amarra o registro ao fato (a ficha nova tem de existir) e
// evita um destino digitado errado.
//
// Onde procura (mudou em 19/11/2026, OS de 11/11, item 6): em TODO o grupo de
// quem registra, e não só nas empresas que o login enxerga. Antes, a busca
// presa ao login recusava o caso real — Angela e Gracielly, ativas na VAPT e
// ainda ativas na LM, que fica em outro login ("Não há ficha ATIVA com este
// CPF em outro CNPJ"). A parede de GRUPO continua: nunca procura fora dele. O
// que se revela é só o nome do CNPJ de destino dentro do próprio grupo, para
// quem já pode encerrar a ficha de origem.

import type { Cliente } from "@/lib/prisma";
import { somarDiasUTC } from "@/lib/datas";
import { empresasDoGrupo, grupoDoUsuario } from "@/lib/grupo";

export const MOTIVO_TRANSFERENCIA = "TRANSFERENCIA_GRUPO";

export function ehTransferencia(motivo: string | null | undefined): boolean {
  return motivo === MOTIVO_TRANSFERENCIA;
}

export type DestinoTransferencia =
  | { ok: true; empresaId: string; empresaNome: string }
  | { ok: false; error: string };

/**
 * O CNPJ para onde a pessoa foi: a empresa da ficha ATIVA com o mesmo CPF,
 * fora da empresa de origem, dentro do que o usuário enxerga.
 */
export async function destinoDaTransferencia(
  cliente: Cliente,
  colaborador: { id: string; empresaId: string; cpf: string | null },
  /** Empresas do GRUPO de quem registra (empresasDoGrupoDoUsuario). */
  empresasDoUsuario: string[],
): Promise<DestinoTransferencia> {
  if (!colaborador.cpf) {
    return {
      ok: false,
      error: "Para registrar transferência, a ficha precisa ter CPF — é por ele que o sistema acha a ficha no CNPJ novo.",
    };
  }
  const candidatas = await cliente.colaborador.findMany({
    where: {
      cpf: colaborador.cpf,
      ativo: true,
      id: { not: colaborador.id },
      empresaId: { not: colaborador.empresaId, in: empresasDoUsuario },
    },
    select: { empresaId: true, empresa: { select: { nome: true } } },
  });
  if (candidatas.length === 0) {
    return {
      ok: false,
      error:
        "Não há ficha ATIVA com este CPF em outro CNPJ. Cadastre a pessoa no CNPJ novo primeiro e depois registre a transferência aqui.",
    };
  }
  if (candidatas.length > 1) {
    return {
      ok: false,
      error: `Este CPF está ativo em ${candidatas.length} outros CNPJs (${candidatas
        .map((c) => c.empresa.nome)
        .join(", ")}). Encerre a ficha que sobra antes de registrar a transferência.`,
    };
  }
  return { ok: true, empresaId: candidatas[0].empresaId, empresaNome: candidatas[0].empresa.nome };
}

// ---------------------------------------------------------------
// Transferência nas CONTAS (turnover, admissões, quadro) — v1.214.0
// ---------------------------------------------------------------
//
// Regra do CEO (25/11/2026): transferência entre empresas do grupo NÃO conta
// como desligamento nem como admissão. Até aqui nenhuma conta sabia disso: a
// ficha antiga entrava como saída num CNPJ e a ficha nova como contratação no
// outro, e o consolidado do grupo somava as duas — turnover inflado justamente
// no número que a diretoria usa para cobrar os gestores.
//
// O que muda e o que não muda:
// - A SAÍDA por transferência continua mexendo no QUADRO do recorte (a pessoa
//   saiu daquele CNPJ/setor), mas não entra na contagem de desligamentos.
// - A CHEGADA por transferência idem: soma no quadro, não é contratação.
// - O quadro reconstruído do grupo fica igual, porque as duas pontas se anulam.
//
// Funções puras, sem Prisma: a ficha de origem é buscada pelo caller
// (lib/transferencia-grupo.ts) e chega aqui como lista.

/** Ficha que vai entrar nas contas. */
export type FichaParaTransferencia = {
  id: string;
  empresaId: string;
  cpf: string | null;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  motivoDesligamento: string | null;
};

/** Ficha ENCERRADA por transferência, em qualquer CNPJ do grupo. */
export type SaidaPorTransferencia = {
  id: string;
  empresaId: string;
  cpf: string | null;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  transferidoParaEmpresaId: string | null;
};

export type MarcasDeTransferencia = {
  /** A saída desta ficha é transferência: mexe no quadro, não é desligamento. */
  saidaPorTransferencia: boolean;
  /** A admissão desta ficha é chegada por transferência: mexe no quadro, não é contratação. */
  entradaPorTransferencia: boolean;
  /**
   * A admissão que vale para o QUADRO (lib/bi.ts lê este campo quando ele
   * existe). Igual à do cadastro, exceto na chegada por transferência com
   * admissão anterior à data da transferência (a ficha nova herdou a admissão
   * original): aí vale a data da transferência — senão a pessoa conta nas duas
   * fichas ao mesmo tempo e o quadro infla. `dataAdmissao` continua sendo a do
   * cadastro, para quem usa a admissão para outra coisa.
   */
  dataAdmissaoNoQuadro: Date | null;
  /**
   * Desde quando a pessoa está no GRUPO: a admissão mais antiga da cadeia de
   * transferências. É a base do tempo de casa — o CNPJ não importa.
   */
  inicioNoGrupo: Date | null;
};

/**
 * Até quantos dias DEPOIS da transferência a admissão no CNPJ novo ainda é
 * "a mesma pessoa chegando". Admissão muito posterior é recontratação — essa
 * conta como contratação de verdade. 90 dias cobre o atraso de cadastro que
 * se vê na base (a ficha nova às vezes nasce semanas depois da mudança).
 */
export const TOLERANCIA_TRANSFERENCIA_DIAS = 90;

function soDigitos(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/**
 * Marca cada ficha com o que ela é nas contas. A chegada por transferência é
 * reconhecida pela ficha de ORIGEM: mesmo CPF, encerrada como transferência,
 * com destino = o CNPJ desta ficha, e esta admissão até
 * TOLERANCIA_TRANSFERENCIA_DIAS depois da saída de lá (ou sem data para
 * conferir — na dúvida, a marca registrada pelo RH vale).
 */
export function marcarTransferencias<T extends FichaParaTransferencia>(
  fichas: T[],
  saidasDoGrupo: SaidaPorTransferencia[],
): (T & MarcasDeTransferencia)[] {
  const saidasPorCpf = new Map<string, SaidaPorTransferencia[]>();
  for (const s of saidasDoGrupo) {
    const cpf = soDigitos(s.cpf);
    if (!cpf || !s.transferidoParaEmpresaId) continue;
    const lista = saidasPorCpf.get(cpf) ?? [];
    lista.push(s);
    saidasPorCpf.set(cpf, lista);
  }

  return fichas.map((f) => {
    const saidaPorTransferencia = ehTransferencia(f.motivoDesligamento);
    const cpf = soDigitos(f.cpf);
    const daMesmaPessoa = cpf ? (saidasPorCpf.get(cpf) ?? []).filter((s) => s.id !== f.id) : [];

    // A origem desta ficha: transferência PARA este CNPJ, com a admissão aqui
    // dentro da tolerância. Mais de uma (ida e volta) → a mais recente que
    // ainda casa com a admissão.
    const origens = daMesmaPessoa
      .filter((s) => s.transferidoParaEmpresaId === f.empresaId)
      .filter(
        (s) =>
          !f.dataAdmissao ||
          !s.dataDesligamento ||
          f.dataAdmissao <= somarDiasUTC(s.dataDesligamento, TOLERANCIA_TRANSFERENCIA_DIAS),
      )
      .sort((a, b) => (b.dataDesligamento?.getTime() ?? 0) - (a.dataDesligamento?.getTime() ?? 0));
    const origem = origens[0];
    const entradaPorTransferencia = origem !== undefined;

    let dataAdmissaoNoQuadro = f.dataAdmissao;
    if (origem?.dataDesligamento && (!f.dataAdmissao || f.dataAdmissao < origem.dataDesligamento)) {
      dataAdmissaoNoQuadro = origem.dataDesligamento;
    }

    // Tempo de casa: a admissão mais antiga entre esta ficha e as fichas de
    // transferência da mesma pessoa que saíram até a chegada aqui (A → B → C
    // pega a admissão em A).
    let inicioNoGrupo = f.dataAdmissao;
    if (entradaPorTransferencia) {
      const limite = dataAdmissaoNoQuadro
        ? somarDiasUTC(dataAdmissaoNoQuadro, TOLERANCIA_TRANSFERENCIA_DIAS)
        : null;
      for (const s of daMesmaPessoa) {
        if (limite && s.dataDesligamento && s.dataDesligamento > limite) continue;
        if (s.dataAdmissao && (!inicioNoGrupo || s.dataAdmissao < inicioNoGrupo)) inicioNoGrupo = s.dataAdmissao;
      }
    }

    return {
      ...f,
      saidaPorTransferencia,
      entradaPorTransferencia,
      dataAdmissaoNoQuadro,
      inicioNoGrupo,
    };
  });
}

/**
 * As empresas onde procurar a ficha de destino: o grupo inteiro de quem
 * registra. Mantido aqui para os três chamadores (ficha, desligamento e
 * offboarding) usarem a mesma régua.
 */
export async function empresasDoGrupoDoUsuario(usuarioId: string | undefined): Promise<string[]> {
  return empresasDoGrupo(await grupoDoUsuario(usuarioId));
}
