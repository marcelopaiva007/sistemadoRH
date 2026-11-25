// Periodicidade do ASO periódico pela NR-7 (PCMSO), item 7.5.8, redação de
// 2022 (Portaria SEPRT 6.734/2020, em vigor desde 03/01/2022).
//
// Criado em 26/11/2026. Até então todo ASO valia 12 meses — o
// `validadePadraoMeses` de lib/constants-sst.ts, igual para todo mundo. A
// NR-7 diz outra coisa:
//
//   - ANUAL para quem tem risco ocupacional identificado no PGR (ou é
//     portador de doença crônica — o médico define no PCMSO);
//   - ANUAL para menores de 18 e maiores de 45 anos;
//   - a cada 2 ANOS para os demais.
//
// O sistema NÃO sabe o risco do cargo: Posicao não tem campo de risco do PGR
// (nem Colaborador de doença crônica). Quem não tem risco informado fica
// ANUAL, com o aviso "confirme no PCMSO" — decisão de 26/11/2026 na revisão:
// as empresas do grupo são de telecom, com técnico de campo em eletricidade
// (NR-10) e altura (NR-35), e presumir "sem risco" marcaria como em dia, por
// um ano a mais, quem o PCMSO manda examinar todo ano. Os 2 anos só valem
// quando o risco vier informado como AUSENTE (riscoOcupacional === false) —
// o campo ainda não existe no cadastro; quando existir, a regra já está aqui.
// Sem data de nascimento também fica anual.
//
// Idade em anos completos: "maior de 45" = 46 anos ou mais; "menor de 18" =
// até 17. Quem está em 2 anos mas faz 46 antes disso passa para o regime anual
// no aniversário — o vencimento é o que vier primeiro entre os 2 anos e o
// aniversário de 46 (nunca antes dos 12 meses do último exame).
//
// Sem Prisma: função pura, testada em scripts/test-aso-periodicidade.ts.
import { anosCompletos, somarAnosUTC, somarMesesUTC, inicioDoDiaUTC } from "@/lib/datas";

export type PerfilAso = {
  dataNascimento: Date | null;
  /** Risco ocupacional identificado no PGR. null/undefined = não informado. */
  riscoOcupacional?: boolean | null;
  /** Portador de doença crônica (definido pelo médico do PCMSO). */
  doencaCronica?: boolean | null;
};

export type PeriodicidadeAso = {
  meses: 12 | 24;
  /** Por que é essa periodicidade, para mostrar na tela. */
  motivo: string;
  /** true quando a conta depende de dado que o sistema não tem. */
  confirmarNoPcmso: boolean;
};

/** Periodicidade do periódico para a pessoa na data de referência (data do exame). */
export function periodicidadeAso(perfil: PerfilAso, referencia: Date): PeriodicidadeAso {
  if (perfil.riscoOcupacional) {
    return { meses: 12, motivo: "anual — risco ocupacional no PGR", confirmarNoPcmso: false };
  }
  if (perfil.doencaCronica) {
    return { meses: 12, motivo: "anual — doença crônica", confirmarNoPcmso: false };
  }
  if (!perfil.dataNascimento) {
    return { meses: 12, motivo: "anual — sem data de nascimento", confirmarNoPcmso: true };
  }
  const idade = anosCompletos(perfil.dataNascimento, referencia);
  if (idade < 18) return { meses: 12, motivo: "anual — menor de 18 anos", confirmarNoPcmso: false };
  if (idade > 45) return { meses: 12, motivo: "anual — maior de 45 anos", confirmarNoPcmso: false };
  // Risco não informado: anual (o lado seguro — ver o topo do arquivo).
  if (perfil.riscoOcupacional !== false) {
    return { meses: 12, motivo: "anual — risco do PGR não informado", confirmarNoPcmso: true };
  }
  return { meses: 24, motivo: "a cada 2 anos", confirmarNoPcmso: false };
}

/**
 * Próximo periódico pela NR-7, a partir do último exame (admissional,
 * periódico, retorno ou mudança de função — o demissional não conta).
 */
export function vencimentoAsoNr7(
  realizadoEm: Date,
  perfil: PerfilAso,
): { vencimento: Date; periodicidade: PeriodicidadeAso } {
  const realizado = inicioDoDiaUTC(realizadoEm);
  const periodicidade = periodicidadeAso(perfil, realizado);
  if (periodicidade.meses === 12 || !perfil.dataNascimento) {
    return { vencimento: somarMesesUTC(realizado, 12), periodicidade };
  }
  // Regime de 2 anos, mas a pessoa pode fazer 46 antes: daí em diante é anual.
  const doisAnos = somarMesesUTC(realizado, 24);
  const umAno = somarMesesUTC(realizado, 12);
  const aniversario46 = somarAnosUTC(inicioDoDiaUTC(perfil.dataNascimento), 46);
  if (aniversario46 < doisAnos) {
    const vencimento = aniversario46 > umAno ? aniversario46 : umAno;
    return {
      vencimento,
      periodicidade: { meses: 12, motivo: "anual — completa 46 anos antes dos 2 anos", confirmarNoPcmso: false },
    };
  }
  return { vencimento: doisAnos, periodicidade };
}

export type VencimentoAso = {
  validoAte: Date | null;
  /** NR7 = calculado aqui; GRAVADO = data menor digitada no exame (prazo do PCMSO). */
  origem: "NR7" | "GRAVADO" | "NENHUM";
  periodicidade: PeriodicidadeAso | null;
};

/**
 * O vencimento que as telas mostram para o exame mais recente da pessoa.
 *
 * O `validoAte` gravado no exame quase sempre é o padrão antigo de 12 meses
 * que o formulário preenchia sozinho — esse é ignorado e vale a NR-7. Se o RH
 * gravou uma data MENOR que a da NR-7 e diferente desse padrão (o PCMSO pediu
 * prazo mais curto, ex.: 6 meses), vale a gravada. Data gravada maior que a da
 * NR-7 não estica o prazo: a norma é o teto.
 */
export function vencimentoAsoEfetivo(
  exame: { tipo: string; realizadoEm: Date; validoAte: Date | null },
  perfil: PerfilAso,
): VencimentoAso {
  if (exame.tipo === "DEMISSIONAL") return { validoAte: null, origem: "NENHUM", periodicidade: null };
  const { vencimento, periodicidade } = vencimentoAsoNr7(exame.realizadoEm, perfil);
  if (exame.validoAte) {
    const gravado = inicioDoDiaUTC(exame.validoAte);
    const padraoAntigo = somarMesesUTC(inicioDoDiaUTC(exame.realizadoEm), 12);
    if (gravado < vencimento && gravado.getTime() !== padraoAntigo.getTime()) {
      return { validoAte: gravado, origem: "GRAVADO", periodicidade };
    }
  }
  return { validoAte: vencimento, origem: "NR7", periodicidade };
}

/** Texto curto da periodicidade para a tabela: "Periódico anual — maior de 45 anos". */
export function textoPeriodicidade(v: VencimentoAso): string | null {
  if (!v.periodicidade) return null;
  if (v.origem === "GRAVADO") return "Prazo do PCMSO (data do exame)";
  const base = `Periódico ${v.periodicidade.motivo}`;
  return v.periodicidade.confirmarNoPcmso ? `${base} — confirme no PCMSO` : base;
}
