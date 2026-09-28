// Caixa de documentos — de quem é o documento.
//
// Puro: recebe as fichas já carregadas (só as do escopo congelado de quem
// enviou o arquivo) e o mapa CNPJ → empresa, e decide. Nunca aceita um id
// vindo da IA: ela lê nome, CPF e CNPJ; quem escolhe a ficha é este arquivo.
//
// A ordem é a de lib/duplicados.ts e do importador (rh-importacao.ts): CPF
// primeiro, nome só como último recurso.
//
// O mesmo CPF pode ter mais de uma ficha (@@unique([empresaId, cpf]): um CNPJ
// por ficha, transferências). Por isso, documento que é DO EMPREGADOR
// (contracheque, rescisão, informe, recibo de férias, ASO) só grava sozinho
// com o CNPJ impresso no documento batendo com a empresa da ficha — é a mesma
// classe de erro do incidente de 22/08 (AGENTS.md): gravar no CNPJ errado não
// dá erro na tela, dá um número plausível e errado.
import { apenasDigitosCpf } from "@/lib/cpf";
import { normalizarTexto } from "@/lib/text";
import { limparNome } from "@/lib/importacao-colaboradores";
import { diferencaEmDiasUTC } from "@/lib/datas";
import { DIAS_APOS_DESLIGAMENTO, TIPOS_DE_QUEM_SAIU, visivelNoPortal, type TipoCaixa } from "./tipos";

export type Candidato = {
  id: string;
  empresaId: string;
  nome: string;
  cpf: string | null;
  pis?: string | null;
  ativo: boolean;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
};

/** Toda empresa cadastrada com CNPJ, com ou sem acesso do usuário (para não revelar nada fora dele). */
export type EmpresaPorCnpj = Map<string, { id: string; noEscopo: boolean }>;

export type Identificacao =
  | { tipo: "CPF" | "PIS" | "NOME_CNPJ"; colaboradorId: string; empresaId: string }
  | { tipo: "SUGESTAO"; colaboradorId: string; empresaId: string; motivo: string }
  | { tipo: "NENHUM"; motivo: string; opcoes: string[] };

/** Documento emitido pelo empregador: a empresa certa é parte do documento. */
export const TIPOS_DO_EMPREGADOR: readonly TipoCaixa[] = [
  "CONTRACHEQUE",
  "RECIBO_FERIAS",
  "TRCT",
  "INFORME_RENDIMENTOS",
  "ASO",
];

export function nomeComparavel(nome: string): string {
  // Nomes antigos no cadastro às vezes carregam lixo no começo ("(SERASA)",
  // números): limparNome tira a marcação entre parênteses; os dígitos soltos
  // saem aqui. Comparação sem acento, sem caixa e com espaço único.
  return normalizarTexto(limparNome(nome).replace(/[\d.\-/]+/g, " "));
}

/**
 * O nome lido confere com o da ficha? Primeiro e último nome iguais (sem
 * acento/caixa) — tolera nome do meio abreviado ("JOSE A. SILVA").
 */
export function nomesConferem(lido: string | null, daFicha: string): boolean {
  if (!lido) return false;
  const a = nomeComparavel(lido).split(" ").filter(Boolean);
  const b = nomeComparavel(daFicha).split(" ").filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

function podeSerDeQuemSaiu(tipo: TipoCaixa, asoTipo: string | null): boolean {
  if (tipo === "ASO") return asoTipo === "DEMISSIONAL";
  return TIPOS_DE_QUEM_SAIU.includes(tipo);
}

export function identificar(
  item: {
    tipo: TipoCaixa;
    nome: string | null;
    cpf: string | null;
    pis?: string | null;
    cnpj: string | null;
    asoTipo: string | null;
    /** A data a que o documento se refere (competência, emissão) — decide se ficha desligada ainda vale. */
    dataReferencia?: Date | null;
  },
  fichasNoEscopo: Candidato[],
  empresas: EmpresaPorCnpj,
  hoje: Date,
): Identificacao {
  const doEmpregador = TIPOS_DO_EMPREGADOR.includes(item.tipo);
  const aceitaDesligado = podeSerDeQuemSaiu(item.tipo, item.asoTipo);
  // Ficha desligada só vale para documento DO TEMPO em que a pessoa estava lá
  // (até um mês depois da saída — a rescisão e o último contracheque chegam
  // depois). Sem data no documento, vale a janela a partir de hoje.
  const elegivel = (c: Candidato) => {
    if (c.ativo) return true;
    if (!aceitaDesligado || !c.dataDesligamento) return false;
    const ref = item.dataReferencia ?? null;
    if (ref) return diferencaEmDiasUTC(ref, c.dataDesligamento) <= 31 && (!c.dataAdmissao || diferencaEmDiasUTC(c.dataAdmissao, ref) <= 31);
    return diferencaEmDiasUTC(hoje, c.dataDesligamento) <= DIAS_APOS_DESLIGAMENTO;
  };

  // Empresa do documento, quando impressa.
  let empresaDoDocumento: string | null = null;
  let avisoCnpj: string | null = null;
  if (item.cnpj) {
    const empresa = empresas.get(item.cnpj);
    if (empresa && !empresa.noEscopo) {
      // Não diz de quem nem de que empresa: o usuário não enxerga aquele CNPJ.
      return { tipo: "NENHUM", motivo: "O documento é de uma empresa que você não acessa.", opcoes: [] };
    }
    if (empresa) empresaDoDocumento = empresa.id;
    else avisoCnpj = "O CNPJ impresso no documento não é de nenhuma empresa cadastrada.";
  } else if (doEmpregador) {
    avisoCnpj = "O documento não traz o CNPJ da empresa — confirme em qual ficha ele entra.";
  }

  // Universo: com CNPJ reconhecido, só as fichas daquela empresa. Homônimos e
  // CPFs repetidos são contados sobre TODAS elas (ativas ou não) — uma ficha
  // antiga com o mesmo nome já é motivo para o RH olhar.
  const universo = empresaDoDocumento ? fichasNoEscopo.filter((c) => c.empresaId === empresaDoDocumento) : fichasNoEscopo;

  const porNome = (nome: string, lista: Candidato[]) => {
    const alvo = nomeComparavel(nome);
    return alvo.length >= 5 ? lista.filter((c) => nomeComparavel(c.nome) === alvo) : [];
  };

  // A chave forte: o CPF; sem ele, o PIS (contracheque costuma trazer o PIS).
  const chave: { campo: "CPF" | "PIS"; valor: string } | null = item.cpf
    ? { campo: "CPF", valor: item.cpf }
    : item.pis
      ? { campo: "PIS", valor: item.pis }
      : null;
  const docDa = (c: Candidato) =>
    chave?.campo === "CPF" ? (c.cpf ? apenasDigitosCpf(c.cpf) : "") : (c.pis ?? "").replace(/\D/g, "");

  if (chave) {
    const rotulo = chave.campo;
    const comCpf = universo.filter((c) => docDa(c) === chave.valor);
    const elegiveis = comCpf.filter(elegivel);
    // Sem CNPJ, a ficha ativa ganha da desligada (recontratação,
    // duplicados.ts) — mas isso só vale como SUGESTÃO para documento do
    // empregador, que exige o CNPJ.
    const preferidas = elegiveis.some((c) => c.ativo) ? elegiveis.filter((c) => c.ativo) : elegiveis;

    if (preferidas.length === 1) {
      const f = preferidas[0];
      // A única ficha que serve está desligada, mas a mesma pessoa tem ficha
      // ATIVA em outro CNPJ que você acessa: transferência ou recontratação —
      // o RH decide qual.
      if (!f.ativo) {
        const ativaEmOutro = fichasNoEscopo.filter((c) => c.ativo && c.id !== f.id && docDa(c) === chave.valor);
        if (ativaEmOutro.length > 0) {
          return {
            tipo: "NENHUM",
            motivo: "Esta pessoa tem uma ficha desligada e outra ativa em outro CNPJ — escolha qual.",
            opcoes: [f.id, ...ativaEmOutro.map((c) => c.id)],
          };
        }
      }
      if (doEmpregador && !empresaDoDocumento) {
        return { tipo: "SUGESTAO", colaboradorId: f.id, empresaId: f.empresaId, motivo: avisoCnpj ?? "Confira a empresa." };
      }
      if (empresaDoDocumento && comCpf.length > 1) {
        return {
          tipo: "NENHUM",
          motivo: `Há mais de uma ficha com este ${rotulo} nesta empresa — escolha qual.`,
          opcoes: comCpf.map((c) => c.id),
        };
      }
      // Número lido com um dígito trocado pode ser o de OUTRA pessoa válida.
      // Para o que vai ao portal, o nome tem de confirmar a ficha.
      if (visivelNoPortal(item.tipo) && !nomesConferem(item.nome, f.nome)) {
        return {
          tipo: "SUGESTAO",
          colaboradorId: f.id,
          empresaId: f.empresaId,
          motivo: `O nome lido não confere com a ficha deste ${rotulo}. Confira antes de gravar.`,
        };
      }
      return { tipo: rotulo, colaboradorId: f.id, empresaId: f.empresaId };
    }
    if (preferidas.length > 1) {
      return {
        tipo: "NENHUM",
        motivo: `Este ${rotulo} tem mais de uma ficha ativa (CNPJs diferentes) e o documento não diz de qual empresa é.`,
        opcoes: preferidas.map((c) => c.id),
      };
    }
    if (comCpf.length > 0) {
      return {
        tipo: "NENHUM",
        motivo: `A ficha com este ${rotulo} está desligada — e o documento não é do tempo em que a pessoa estava lá.`,
        opcoes: comCpf.map((c) => c.id),
      };
    }
    // Número lido e ninguém com ele: pode ser alguém fora do seu acesso, sem
    // o número cadastrado ou ainda não cadastrado. O nome vira só sugestão — e
    // só entre fichas SEM esse número: nome igual com outro número cadastrado
    // é outra pessoa.
    const nomes = item.nome ? porNome(item.nome, universo).filter((c) => !docDa(c)) : [];
    if (nomes.length === 1 && elegivel(nomes[0])) {
      return {
        tipo: "SUGESTAO",
        colaboradorId: nomes[0].id,
        empresaId: nomes[0].empresaId,
        motivo: `O ${rotulo} do documento não está na ficha de ninguém; o nome bate com uma pessoa sem ${rotulo} cadastrado. Confira antes de gravar.`,
      };
    }
    return { tipo: "NENHUM", motivo: `Ninguém com este ${rotulo} entre os colaboradores que você acessa.`, opcoes: nomes.map((c) => c.id) };
  }

  if (!item.nome) {
    return { tipo: "NENHUM", motivo: "O documento não traz nome nem CPF legíveis.", opcoes: [] };
  }

  const nomes = porNome(item.nome, universo);
  if (nomes.length === 1 && elegivel(nomes[0])) {
    const f = nomes[0];
    // Nome + CNPJ grava sozinho só o que NÃO vai para o portal (exame, NR):
    // um contracheque no portal de um homônimo é o pior erro possível aqui.
    // ASO admissional de quem ainda nem tem ficha casaria com um homônimo.
    if (empresaDoDocumento && !visivelNoPortal(item.tipo) && item.asoTipo !== "ADMISSIONAL") {
      return { tipo: "NOME_CNPJ", colaboradorId: f.id, empresaId: f.empresaId };
    }
    return {
      tipo: "SUGESTAO",
      colaboradorId: f.id,
      empresaId: f.empresaId,
      motivo: empresaDoDocumento
        ? "Achado pelo nome dentro da empresa do documento, sem CPF para confirmar. Confira antes de gravar."
        : "Achado só pelo nome (o documento não traz CPF nem CNPJ que confirme). Confira antes de gravar.",
    };
  }
  if (nomes.length > 1) {
    return { tipo: "NENHUM", motivo: `Há ${nomes.length} fichas com este nome — escolha qual.`, opcoes: nomes.map((c) => c.id) };
  }
  if (nomes.length === 1) {
    return { tipo: "NENHUM", motivo: "A única ficha com este nome está desligada.", opcoes: [nomes[0].id] };
  }
  return { tipo: "NENHUM", motivo: "Ninguém com este nome entre os colaboradores que você acessa.", opcoes: [] };
}
