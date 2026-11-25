// A montagem comum da área Desligamentos: escopo, base, filtros da URL e os
// avisos. Uma função só para as abas (Painel, Motivos, Contratação,
// Comparações, Pendências) e para o PDF — o relatório que vai para a reunião
// de gerentes é exatamente o que está na tela com os mesmos filtros.
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { direcaoRestrita } from "@/lib/grupo";
import { hojeUTC } from "@/lib/datas";
import { ehSetorSemSetor } from "@/lib/retrato-desligamento";
import { carregarBaseDaArea, type BaseDaArea } from "@/lib/desligamentos/base";
import {
  ehDesligamento,
  periodoDaUrl,
  ROTULO_ORIGEM_GESTOR,
  type ChavePeriodo,
  type FichaDoPainel,
  type OrigemDoGestor,
  type Periodo,
} from "@/lib/desligamentos/painel";

export type ParametrosDaArea = {
  periodo?: string;
  de?: string;
  ate?: string;
  setor?: string;
  gestor?: string;
  ano?: string;
};

/** O que os filtros da tela precisam (serializável — vai para o cliente). */
export type FiltrosDaArea = {
  periodo: { chave: ChavePeriodo; rotulo: string; de: string; ate: string };
  ano: number;
  anoAtual: number;
  setor: string | null;
  gestor: string | null;
  setores: { chave: string; nome: string }[];
  gestores: { chave: string; nome: string }[];
};

export type Area = {
  hoje: Date;
  base: BaseDaArea;
  /** As fichas já no recorte de setor/gestor escolhido. */
  fichas: FichaDoPainel[];
  ativosHoje: number;
  periodo: Periodo;
  ano: number;
  filtros: FiltrosDaArea;
  /** Nome do recorte ("setor Comercial", "equipe de Ana"), ou null sem filtro. */
  nomeDoRecorte: string | null;
  podeConfigurar: boolean;
  avisos: string[];
};

export async function montarArea(
  empresaId: string,
  usuario: { id?: string; role: string; empresas: { empresaId: string; ativo: boolean }[] },
  sp: ParametrosDaArea,
): Promise<Area> {
  const hoje = hojeUTC();
  const escopo = await empresasVisiveis(usuario);
  const [base, restrita] = await Promise.all([carregarBaseDaArea(empresaId, escopo), direcaoRestrita(usuario)]);
  const podeConfigurar = (usuario.role === "ADMIN" || usuario.role === "DIRETORIA") && !restrita;

  const periodo = periodoDaUrl(sp, hoje);
  const anoAtual = hoje.getUTCFullYear();
  const anoPedido = Number(sp.ano);
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2000 && anoPedido <= anoAtual ? anoPedido : anoAtual;

  // Opções dos filtros a partir da base INTEIRA (filtrar num setor não pode
  // sumir com os outros do seletor). Setor/gestor da URL só vale se existir.
  const setoresDisponiveis = new Map<string, string>();
  const gestoresDisponiveis = new Map<string, string>();
  for (const f of base.fichas) {
    if (!setoresDisponiveis.has(f.chaveSetor)) setoresDisponiveis.set(f.chaveSetor, f.setor);
    if (!gestoresDisponiveis.has(f.gestorChave)) gestoresDisponiveis.set(f.gestorChave, f.gestorNome);
  }
  const setor = sp.setor && setoresDisponiveis.has(sp.setor) ? sp.setor : null;
  const gestor = sp.gestor && gestoresDisponiveis.has(sp.gestor) ? sp.gestor : null;

  const fichas = base.fichas.filter(
    (f) => (!setor || f.chaveSetor === setor) && (!gestor || f.gestorChave === gestor),
  );
  const ativosHoje = fichas.filter((f) => f.ativo).length;

  const nomeDoRecorte = setor
    ? `setor ${setoresDisponiveis.get(setor)}`
    : gestor
      ? `equipe de ${gestoresDisponiveis.get(gestor)}`
      : null;

  return {
    hoje,
    base,
    fichas,
    ativosHoje,
    periodo,
    ano,
    filtros: {
      periodo: {
        chave: periodo.chave,
        rotulo: periodo.rotulo,
        de: periodo.chave === "personalizado" ? (sp.de ?? "") : "",
        ate: periodo.chave === "personalizado" ? (sp.ate ?? "") : "",
      },
      ano,
      anoAtual,
      setor,
      gestor,
      setores: [...setoresDisponiveis.entries()]
        .map(([chave, nome]) => ({ chave, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      gestores: [...gestoresDisponiveis.entries()]
        .map(([chave, nome]) => ({ chave, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    },
    nomeDoRecorte,
    podeConfigurar,
    avisos: avisosDaArea(fichas, base, periodo, hoje),
  };
}

/** O que o número NÃO cobre, dito na tela em vez de escondido. */
function avisosDaArea(fichas: FichaDoPainel[], base: BaseDaArea, periodo: Periodo, hoje: Date): string[] {
  const fim = periodo.fim > hoje ? hoje : periodo.fim;
  const saidas = fichas.filter(
    (f) => ehDesligamento(f) && f.dataDesligamento! >= periodo.inicio && f.dataDesligamento! <= fim,
  );
  const avisos: string[] = [];
  const semRetrato = saidas.filter((f) => !f.temRetrato).length;
  if (semRetrato > 0) {
    avisos.push(
      `${semRetrato} das ${saidas.length} saídas do período são anteriores ao registro do setor da época (v1.213.0): contam no setor ATUAL da ficha, e o gestor delas vem do cadastro de hoje.`,
    );
  }
  const semSetor = saidas.filter((f) => ehSetorSemSetor(f.setor)).length;
  if (semSetor > 0) {
    avisos.push(
      `${semSetor} saída(s) do período estão com setor "Não definido" — aparecem numa linha própria até o RH corrigir o setor na ficha (ver Pendências).`,
    );
  }
  const porOrigem = new Map<OrigemDoGestor, number>();
  for (const f of saidas) porOrigem.set(f.gestorOrigem, (porOrigem.get(f.gestorOrigem) ?? 0) + 1);
  if (saidas.length > 0) {
    avisos.push(
      "Gestor de cada saída: " +
        [...porOrigem.entries()].map(([origem, total]) => `${total} pelo ${ROTULO_ORIGEM_GESTOR[origem]}`).join(", ") +
        ". Desligamentos registrados a partir da v1.213.0 guardam o líder do dia da saída.",
    );
  }
  const transferencias = fichas.filter(
    (f) =>
      (f.saidaPorTransferencia && f.dataDesligamento && f.dataDesligamento >= periodo.inicio && f.dataDesligamento <= fim) ||
      (f.entradaPorTransferencia &&
        f.dataAdmissaoNoQuadro &&
        f.dataAdmissaoNoQuadro >= periodo.inicio &&
        f.dataAdmissaoNoQuadro <= fim),
  ).length;
  if (transferencias > 0) {
    avisos.push(
      `${transferencias} transferência(s) entre empresas do grupo no período ficaram fora da conta — não são desligamento nem admissão.`,
    );
  }
  if (base.desligadosSemData > 0) {
    avisos.push(
      `${base.desligadosSemData} desligado(s) sem data de saída no cadastro não entram em conta nenhuma — ver Pendências.`,
    );
  }
  return avisos;
}
