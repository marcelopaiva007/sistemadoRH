// A matéria-prima da área Desligamentos: as fichas do escopo, já marcadas com
// o que elas são nas contas (transferência, setor da época, gestor), e a
// configuração do cliente.
//
// ESCOPO: tudo o que o usuário enxerga (`empresasVisiveis`), sem filtro de
// CNPJ — regra da área ("o CNPJ do colaborador não importa"). O recorte de
// marca do usuário continua valendo, porque é ele que monta `visiveis`.
//
// GESTOR RESPONSÁVEL de cada ficha, nesta ordem (a tela diz qual valeu):
//   1. desligado com retrato → o líder no dia da saída (RetratoDesligamento);
//   2. o líder no cadastro (`supervisorId`, o mesmo do Organograma);
//   3. o PRINCIPAL LÍDER DO SETOR: quem lidera mais gente ativa naquele setor;
//   4. o gestor do setor no sistema (usuário GESTOR_SETOR), se o setor não
//      tem líder nenhum entre os ativos;
//   5. "Sem gestor definido".
// Medido em 11/2026: só 1 dos 137 desligados tinha `supervisorId`. O histórico
// cai quase todo no passo 3. Ele existe para o quadro por gestor comparar
// coisas comparáveis: na primeira versão o passo 3 era o usuário GESTOR_SETOR,
// e as saídas antigas iam para uma linha SEM ninguém ativo (turnover de 300%,
// 600%) enquanto os líderes de verdade apareciam com 0% — a equipe ficava num
// lugar e as saídas dela em outro. Pelo principal líder, a saída antiga soma
// com a equipe que hoje responde por aquele setor; a tela diz quantas saídas
// de cada gestor vieram por essa dedução. Daqui para a frente o retrato grava
// o líder e a dedução deixa de ser necessária.
import { prisma } from "@/lib/prisma";
import { grupoDaEmpresa } from "@/lib/grupo";
import { marcarTransferencias } from "@/lib/transferencia";
import { saidasPorTransferenciaDoGrupo } from "@/lib/transferencia-grupo";
import { setorParaContas } from "@/lib/retrato-desligamento";
import { chaveDeSetor } from "@/lib/painel-setor";
import { CONFIG_PADRAO, type ConfigDaArea, type FichaDoPainel } from "@/lib/desligamentos/painel";

export async function configuracaoDaArea(empresaIdDaRota: string): Promise<ConfigDaArea> {
  const grupoId = await grupoDaEmpresa(empresaIdDaRota);
  const linha = grupoId
    ? await prisma.configuracaoDesligamentos.findUnique({
        where: { grupoId },
        select: { custoPorDesligamentoCentavos: true, metaPct: true, limitePct: true },
      })
    : null;
  if (!linha) return { ...CONFIG_PADRAO, personalizada: false };
  return {
    custoPorDesligamento: linha.custoPorDesligamentoCentavos / 100,
    metaPct: linha.metaPct,
    limitePct: linha.limitePct,
    personalizada: true,
  };
}

export type BaseDaArea = {
  fichas: FichaDoPainel[];
  config: ConfigDaArea;
  /** Desligados do escopo sem data de saída: existem, mas nenhuma conta os enxerga. */
  desligadosSemData: number;
};

export async function carregarBaseDaArea(empresaIdDaRota: string, escopo: string[]): Promise<BaseDaArea> {
  const [fichasDoCadastro, saidasPorTransferencia, gestoresDeSetor, config] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: { in: escopo } },
      // `select` explícito: nada de salário, documento ou contato. CPF entra só
      // para reconhecer a transferência e não sai daqui.
      select: {
        id: true,
        nome: true,
        empresaId: true,
        cpf: true,
        ativo: true,
        dataAdmissao: true,
        dataDesligamento: true,
        motivoDesligamento: true,
        causaDesligamento: true,
        supervisor: { select: { id: true, nome: true } },
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        retratoDesligamento: {
          select: { setorNome: true, posicaoNome: true, supervisorId: true, supervisorNome: true },
        },
      },
    }),
    saidasPorTransferenciaDoGrupo(escopo),
    prisma.userEmpresa.findMany({
      where: {
        empresaId: { in: escopo },
        role: "GESTOR_SETOR",
        ativo: true,
        setorId: { not: null },
        user: { ativo: true },
      },
      select: { setor: { select: { nome: true } }, user: { select: { id: true, nome: true } } },
    }),
    configuracaoDaArea(empresaIdDaRota),
  ]);

  // Gestor(es) de cada setor, pela chave normalizada do nome (Setor é uma linha
  // por CNPJ — o "Comercial" de dois CNPJs é o mesmo setor para quem gere).
  const gestoresPorSetor = new Map<string, Map<string, string>>();
  for (const v of gestoresDeSetor) {
    if (!v.setor) continue;
    const chave = chaveDeSetor(v.setor.nome);
    const nomes = gestoresPorSetor.get(chave) ?? new Map<string, string>();
    nomes.set(v.user.id, v.user.nome);
    gestoresPorSetor.set(chave, nomes);
  }

  const marcadas = marcarTransferencias(fichasDoCadastro, saidasPorTransferencia);

  // O principal líder de cada setor: quem lidera mais gente ATIVA ali (empate,
  // o nome em ordem alfabética, para a escolha não mudar de uma carga para a
  // outra). É a dedução do passo 3 — ver o cabeçalho.
  const contagemDeLideres = new Map<string, Map<string, { nome: string; total: number }>>();
  for (const f of marcadas) {
    if (!f.ativo || !f.supervisor) continue;
    const chave = chaveDeSetor(setorParaContas(f));
    const lideres = contagemDeLideres.get(chave) ?? new Map<string, { nome: string; total: number }>();
    const atual = lideres.get(f.supervisor.id) ?? { nome: f.supervisor.nome, total: 0 };
    atual.total++;
    lideres.set(f.supervisor.id, atual);
    contagemDeLideres.set(chave, lideres);
  }
  const principalLiderDoSetor = new Map<string, { id: string; nome: string }>();
  for (const [chave, lideres] of contagemDeLideres) {
    const [id, l] = [...lideres.entries()].sort(
      (a, b) => b[1].total - a[1].total || a[1].nome.localeCompare(b[1].nome, "pt-BR"),
    )[0];
    principalLiderDoSetor.set(chave, { id, nome: l.nome });
  }

  const fichas: FichaDoPainel[] = marcadas.map((f) => {
    const setor = setorParaContas(f);
    const chaveSetor = chaveDeSetor(setor);
    const retrato = !f.ativo ? f.retratoDesligamento : null;
    const principal = principalLiderDoSetor.get(chaveSetor);

    let gestorChave: string;
    let gestorNome: string;
    let gestorOrigem: FichaDoPainel["gestorOrigem"];
    if (retrato?.supervisorId && retrato.supervisorNome) {
      gestorChave = `col:${retrato.supervisorId}`;
      gestorNome = retrato.supervisorNome;
      gestorOrigem = "retrato";
    } else if (f.supervisor) {
      gestorChave = `col:${f.supervisor.id}`;
      gestorNome = f.supervisor.nome;
      gestorOrigem = "lider";
    } else if (principal && principal.id !== f.id) {
      gestorChave = `col:${principal.id}`;
      gestorNome = principal.nome;
      gestorOrigem = "lider_do_setor";
    } else if (gestoresPorSetor.has(chaveSetor)) {
      const nomes = [...gestoresPorSetor.get(chaveSetor)!.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      gestorChave = `setor:${chaveSetor}`;
      gestorNome = nomes.map(([, nome]) => nome).join(" / ");
      gestorOrigem = "gestor_do_setor";
    } else {
      gestorChave = "sem-gestor";
      gestorNome = "Sem gestor definido";
      gestorOrigem = "sem_gestor";
    }

    return {
      id: f.id,
      empresaId: f.empresaId,
      nome: f.nome,
      ativo: f.ativo,
      cargo: retrato?.posicaoNome ?? f.posicao.nome,
      setor,
      chaveSetor,
      gestorChave,
      gestorNome,
      gestorOrigem,
      dataAdmissao: f.dataAdmissao,
      dataAdmissaoNoQuadro: f.dataAdmissaoNoQuadro,
      dataDesligamento: f.dataDesligamento,
      inicioNoGrupo: f.inicioNoGrupo,
      motivoDesligamento: f.motivoDesligamento,
      causaDesligamento: f.causaDesligamento,
      saidaPorTransferencia: f.saidaPorTransferencia,
      entradaPorTransferencia: f.entradaPorTransferencia,
      temRetrato: f.retratoDesligamento !== null,
    };
  });

  return {
    fichas,
    config,
    desligadosSemData: fichas.filter((f) => !f.ativo && !f.dataDesligamento).length,
  };
}
