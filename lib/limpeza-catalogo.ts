// Regra pura da limpeza automática de setores e cargos ("Remover N sem
// funcionários"). Nada aqui toca o Prisma — a action conta os vínculos e esta
// função decide o que pode sair.
//
// Até 26/11/2026 a limpeza olhava só colaboradores e, para conseguir apagar o
// setor, apagava JUNTO as metas, as vagas e os planos de ação ligados a ele (e,
// nos cargos, os requisitos de NR e as vagas). Uma vaga aberta com candidatos
// ou um plano de ação de NR-01 em andamento sumiam por efeito colateral de um
// botão de "arrumação" — sem aviso e sem trilha.
//
// Regra nova: limpeza não apaga dado de outra entidade. Setor/cargo com algo
// vivo pendurado fica, e a tela diz quantos ficaram e por quê. O que bloqueia:
//   - vaga ABERTA ou PAUSADA (encerrada não bloqueia: o FK é SetNull, a vaga
//     continua existindo, só perde o vínculo);
//   - plano de ação ABERTO ou EM_ANDAMENTO (idem: concluído/cancelado é SetNull);
//   - QUALQUER meta do setor — o FK de Meta.setor é Cascade: apagar o setor
//     apagaria a meta, inclusive o histórico das já encerradas;
//   - QUALQUER requisito de NR do cargo — também Cascade;
//   - gestor de setor vinculado (UserEmpresa.setorId): soltar esse vínculo muda
//     o que o gestor enxerga, e isso é decisão de permissão, não de limpeza.

export type UsoDoItemCatalogo = {
  colaboradores: number;
  vagasAbertas: number;
  metas: number;
  planosAbertos: number;
  requisitosNR: number;
  gestoresVinculados: number;
};

export type MotivoDeUso =
  | "colaboradores"
  | "vagasAbertas"
  | "metas"
  | "planosAbertos"
  | "requisitosNR"
  | "gestoresVinculados";

const ROTULO: Record<Exclude<MotivoDeUso, "colaboradores">, string> = {
  vagasAbertas: "vaga aberta",
  metas: "meta",
  planosAbertos: "plano de ação aberto",
  requisitosNR: "requisito de NR",
  gestoresVinculados: "gestor de setor vinculado",
};

/** Por que este item NÃO pode sair na limpeza. Lista vazia = pode remover. */
export function motivosDeUso(uso: UsoDoItemCatalogo): MotivoDeUso[] {
  const motivos: MotivoDeUso[] = [];
  if (uso.colaboradores > 0) motivos.push("colaboradores");
  if (uso.vagasAbertas > 0) motivos.push("vagasAbertas");
  if (uso.metas > 0) motivos.push("metas");
  if (uso.planosAbertos > 0) motivos.push("planosAbertos");
  if (uso.requisitosNR > 0) motivos.push("requisitosNR");
  if (uso.gestoresVinculados > 0) motivos.push("gestoresVinculados");
  return motivos;
}

export type DecisaoLimpeza = {
  remover: string[];
  /** Sem colaborador, mas com outro vínculo vivo — ficaram. */
  mantidos: number;
  /** "2 com vaga aberta, 1 com meta" — para a tela. Vazio se nada ficou. */
  motivoMantidos: string;
};

/**
 * Decide a limpeza "sem funcionários". Item COM colaborador nem entra na conta
 * de mantidos (não era candidato); os sem colaborador e com outro vínculo são
 * os que a tela precisa explicar.
 */
export function decidirLimpeza(itens: { id: string; uso: UsoDoItemCatalogo }[]): DecisaoLimpeza {
  const remover: string[] = [];
  const contagem = new Map<string, number>();
  let mantidos = 0;
  for (const { id, uso } of itens) {
    const motivos = motivosDeUso(uso);
    if (motivos.length === 0) {
      remover.push(id);
      continue;
    }
    if (motivos.includes("colaboradores")) continue;
    mantidos++;
    for (const m of motivos) {
      const rotulo = ROTULO[m as Exclude<MotivoDeUso, "colaboradores">];
      contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
    }
  }
  const motivoMantidos = [...contagem.entries()].map(([rotulo, n]) => `${n} com ${rotulo}`).join(", ");
  return { remover, mantidos, motivoMantidos };
}
