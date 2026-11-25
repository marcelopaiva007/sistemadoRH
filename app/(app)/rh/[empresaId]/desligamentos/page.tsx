import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { direcaoRestrita } from "@/lib/grupo";
import { formatarData, hojeUTC } from "@/lib/datas";
import { carregarBaseDaArea } from "@/lib/desligamentos/base";
import {
  detalheDoRecorte,
  ehDesligamento,
  periodoDaUrl,
  placarDaMeta,
  quadroPorGestor,
  quadroPorSetor,
  ROTULO_ORIGEM_GESTOR,
} from "@/lib/desligamentos/painel";
import { ehSetorSemSetor } from "@/lib/retrato-desligamento";
import { PainelDesligamentosView } from "./painel-desligamentos-view";

/**
 * Painel da área Desligamentos — a tela da reunião de gerentes.
 *
 * Responde, nesta ordem, o que a ordem de serviço do CEO (25/11/2026) pede:
 *   1. o placar da meta do ano (10% do quadro médio, limite de 15%);
 *   2. quanto isso custou (custo mínimo por desligamento × saídas);
 *   3. quais setores e quais gestores puxam o número para cima;
 *   4. o detalhe do setor ou gestor clicado.
 *
 * Todo número sai de lib/desligamentos/painel.ts (puro, testado) a partir da
 * base de lib/desligamentos/base.ts. Escopo: tudo que o usuário enxerga, sem
 * CNPJ — o `?empresas=` da lateral NÃO recorta esta tela, de propósito.
 */
export default async function DesligamentosPainelPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    setor?: string;
    gestor?: string;
    ano?: string;
  }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);
  const escopo = await empresasVisiveis(usuario);
  const hoje = hojeUTC();

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
  const setorSelecionado = sp.setor && setoresDisponiveis.has(sp.setor) ? sp.setor : null;
  const gestorSelecionado = sp.gestor && gestoresDisponiveis.has(sp.gestor) ? sp.gestor : null;

  const fichas = base.fichas.filter(
    (f) =>
      (!setorSelecionado || f.chaveSetor === setorSelecionado) &&
      (!gestorSelecionado || f.gestorChave === gestorSelecionado),
  );
  const ativosHoje = fichas.filter((f) => f.ativo).length;

  const placar = placarDaMeta(fichas, ativosHoje, ano, hoje, base.config);
  const setores = quadroPorSetor(fichas, periodo, hoje, base.config);
  const gestores = quadroPorGestor(fichas, periodo, hoje, base.config);
  const detalhe =
    setorSelecionado || gestorSelecionado ? detalheDoRecorte(fichas, periodo, hoje, formatarData) : null;

  // Avisos: o que o número NÃO cobre, dito na tela em vez de escondido.
  const fimDoPeriodo = periodo.fim > hoje ? hoje : periodo.fim;
  const saidasDoPeriodo = fichas.filter(
    (f) => ehDesligamento(f) && f.dataDesligamento! >= periodo.inicio && f.dataDesligamento! <= fimDoPeriodo,
  );
  const avisos: string[] = [];
  const semRetrato = saidasDoPeriodo.filter((f) => !f.temRetrato).length;
  if (semRetrato > 0) {
    avisos.push(
      `${semRetrato} das ${saidasDoPeriodo.length} saídas do período são anteriores ao registro do setor da época (v1.213.0): contam no setor ATUAL da ficha, e o gestor delas vem do cadastro de hoje.`,
    );
  }
  const semSetor = saidasDoPeriodo.filter((f) => ehSetorSemSetor(f.setor)).length;
  if (semSetor > 0) {
    avisos.push(
      `${semSetor} saída(s) do período estão com setor "Não definido" — aparecem numa linha própria até o RH corrigir o setor na ficha.`,
    );
  }
  const porOrigem = new Map<string, number>();
  for (const f of saidasDoPeriodo) porOrigem.set(f.gestorOrigem, (porOrigem.get(f.gestorOrigem) ?? 0) + 1);
  if (saidasDoPeriodo.length > 0) {
    avisos.push(
      "Gestor de cada saída: " +
        [...porOrigem.entries()]
          .map(([origem, total]) => `${total} pelo ${ROTULO_ORIGEM_GESTOR[origem as keyof typeof ROTULO_ORIGEM_GESTOR]}`)
          .join(", ") +
        ". Desligamentos registrados a partir da v1.213.0 guardam o líder do dia da saída.",
    );
  }
  if (placar.transferencias > 0) {
    avisos.push(
      `${placar.transferencias} transferência(s) entre empresas do grupo em ${ano} ficaram fora da conta — não são desligamento nem admissão.`,
    );
  }
  if (base.desligadosSemData > 0) {
    avisos.push(
      `${base.desligadosSemData} desligado(s) sem data de saída no cadastro não entram em conta nenhuma — corrija em Registros.`,
    );
  }

  return (
    <PainelDesligamentosView
      empresaId={empresaId}
      placar={placar}
      setores={setores}
      gestores={gestores}
      detalhe={detalhe}
      config={base.config}
      podeConfigurar={podeConfigurar}
      periodo={{
        chave: periodo.chave,
        rotulo: periodo.rotulo,
        de: periodo.chave === "personalizado" ? (sp.de ?? "") : "",
        ate: periodo.chave === "personalizado" ? (sp.ate ?? "") : "",
      }}
      ano={ano}
      anoAtual={anoAtual}
      filtros={{
        setor: setorSelecionado,
        gestor: gestorSelecionado,
        setores: [...setoresDisponiveis.entries()]
          .map(([chave, nome]) => ({ chave, nome }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        gestores: [...gestoresDisponiveis.entries()]
          .map(([chave, nome]) => ({ chave, nome }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      }}
      avisos={avisos}
    />
  );
}
