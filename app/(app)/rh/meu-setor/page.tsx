import { requireGestorSetor } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { montarMeuTime, type ColaboradorParaTime } from "@/lib/meu-time";
import { montarPainelDoSetor } from "@/lib/painel-setor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AjudaDaTela } from "@/components/ajuda-da-tela";
import { TimeView } from "../[empresaId]/time/time-view";
import { PainelSetorView } from "../[empresaId]/painel-setor/painel-setor-view";
import { MeuSetorView } from "./meu-setor-view";

export default async function MeuSetorPage() {
  const acesso = await requireGestorSetor();

  // Sem empresa/setor no vínculo não há o que mostrar — mas TAMBÉM não há para
  // onde mandar esta pessoa: a home devolve todo GESTOR_SETOR para cá. Esta
  // tela é o fim da linha, então ela precisa dizer o que falta. Ver o comentário
  // longo em `requireGestorSetor`.
  if (!acesso.pronto) {
    return <AcessoIncompleto nome={acesso.user.name ?? acesso.user.username} />;
  }
  const user = acesso.user;

  const setor = await prisma.setor.findUnique({ where: { id: user.setorAtivaId } });
  if (!setor) {
    return <AcessoIncompleto nome={user.name ?? user.username} />;
  }

  // Quem é esta pessoa na folha. Lido do banco a cada request, e não do JWT:
  // o RH pode apontar o vínculo hoje e o gestor precisa ver o time no próximo
  // clique, sem sair e entrar de novo.
  const eu = await prisma.user.findUnique({
    where: { id: user.id },
    select: { colaboradorId: true },
  });

  const pesquisas = await prisma.pesquisa.findMany({
    where: { empresaId: user.empresaAtivaId, status: { in: ["ACTIVE", "FINISHED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      perguntas: true,
      respostas: { where: { setorNomeSnapshot: setor.nome }, include: { itens: { include: { pergunta: true } } } },
    },
  });

  const resultados = pesquisas.map((p) => {
    const somaPorDimensao = new Map<string, { soma: number; qtd: number }>();
    for (const resposta of p.respostas) {
      for (const item of resposta.itens) {
        if (item.valorNumerico == null) continue;
        const dimensao = item.pergunta.dimensaoGPTW ?? "GERAL";
        const atual = somaPorDimensao.get(dimensao) ?? { soma: 0, qtd: 0 };
        atual.soma += item.valorNumerico;
        atual.qtd += 1;
        somaPorDimensao.set(dimensao, atual);
      }
    }
    return {
      id: p.id,
      titulo: p.titulo,
      totalRespostas: p.respostas.length,
      mediaPorDimensao: [...somaPorDimensao.entries()].map(([dimensao, v]) => ({
        dimensao,
        media: v.soma / v.qtd,
      })),
    };
  });

  // Os números de gestão do setor — o MESMO motor e a MESMA vista da tela
  // "Painel do setor" da diretoria (lib/painel-setor.ts): o gestor e quem o
  // cobra leem sempre o mesmo número. O escopo aqui é o CNPJ do vínculo, e a
  // comparação é contra a empresa inteira. Salário não entra em nada disto.
  const [time, painel] = await Promise.all([
    eu?.colaboradorId ? montarTimeDoGestor(eu.colaboradorId) : Promise.resolve(null),
    montarPainelDoSetor({ empresaIds: [user.empresaAtivaId], setorNome: setor.nome }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Meu Setor — {setor.nome}</h1>
          <AjudaDaTela modulo="meu-setor" />
        </div>
        <p className="text-muted-foreground">
          Os números de gestão do setor, o seu time e os resultados agregados das pesquisas de
          clima.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Números do setor</h2>
        <PainelSetorView painel={painel} rotuloEscopo="a empresa" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Meu time</h2>
        {!eu?.colaboradorId ? (
          <Alert>
            <AlertDescription>
              O seu login ainda não está ligado à sua ficha de colaborador, e por isso o sistema
              não sabe quem reporta a você. Peça a quem administra o sistema para fazer a ligação
              na tela <strong>Usuários</strong> (menu de cima), em <strong>Vincular</strong>. Os
              resultados de clima abaixo não dependem disso e já aparecem.
            </AlertDescription>
          </Alert>
        ) : !time || time.linhas.length === 0 ? (
          <Alert>
            <AlertDescription>
              Ninguém está cadastrado como reportando a você. Quem define isso é o campo
              &ldquo;Reporta a&rdquo; na ficha de cada colaborador — o RH ajusta.
            </AlertDescription>
          </Alert>
        ) : (
          <TimeView time={time.time} escopo={time.escopo} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Clima do setor</h2>
        <p className="text-sm text-muted-foreground">
          Para preservar o anonimato, só exibimos números quando há pelo menos{" "}
          {AMOSTRA_MINIMA_ANONIMATO} respostas.
        </p>
        <MeuSetorView resultados={resultados} />
      </section>
    </div>
  );
}

// O que o gestor vê quando o cadastro dele está pela metade. Uma tela, e não um
// redirecionamento: esta rota é o destino de todo GESTOR_SETOR no sistema, então
// mandá-lo embora daqui é mandá-lo de volta para cá (era a tela em branco).
//
// O texto diz o caminho exato da tela que resolve, porque quem lê isto não é
// quem conserta: o gestor não tem acesso ao cadastro de usuários, e sem o nome
// do menu a conversa começa por "não está abrindo aqui". Dois cuidados no
// texto, ambos apanhados em revisão: quem conserta é ADMIN/DIRETORIA — "o RH"
// (papel RH_MANAGER) não alcança a tela de usuários —, e o item de menu
// chama-se só "Usuários" (não há menu "Cadastros"; isso é só a URL).
function AcessoIncompleto({ nome }: { nome: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Setor</h1>
        <p className="text-muted-foreground">
          {nome}, seu acesso ainda não está completo.
        </p>
      </div>

      <Alert>
        <AlertTitle>Falta apontar o seu setor</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Seu login está criado como <strong>gestor de setor</strong>, mas nenhum setor foi
            apontado para ele — e é o setor que define o time e os resultados que apareceriam
            nesta tela.
          </p>
          <p>
            Peça a quem administra o sistema (perfil Administrativo ou Diretoria) para abrir a
            tela <strong>Usuários</strong>, no menu de cima, clicar em <strong>Vincular</strong>{" "}
            no seu nome e escolher a empresa e o setor. Feito isso, basta recarregar esta página
            — e, se não aparecer, sair e entrar de novo.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// O time é quem tem ESTA pessoa como supervisor — o organograma real, e não o
// setor do papel de sistema. São coisas diferentes: um gestor pode liderar
// gente de outro setor, e nem todo mundo do setor reporta a ele.
//
// Sem recorte por empresa, de propósito e igual ao portal: `supervisorId` é
// relação direta entre duas pessoas; se o RH apontou alguém de outro CNPJ do
// grupo como subordinado, esconder essa linha faria o gestor liderar alguém que
// a tela nega existir.
//
// Mesmo motor do /rh/[empresaId]/time (lib/meu-time.ts), para o gestor e o RH
// nunca lerem números diferentes da mesma equipe.
async function montarTimeDoGestor(colaboradorId: string) {
  const subordinados = await prisma.colaborador.findMany({
    where: { supervisorId: colaboradorId, ativo: true },
    orderBy: { nome: "asc" },
    // `select` explícito, nunca `include`: a lista atravessa para um Client
    // Component. cpf/salarioBase/telegramChatId entram só para virar os
    // booleanos de lacuna — os valores não saem do servidor.
    select: {
      id: true,
      nome: true,
      empresaId: true,
      supervisorId: true,
      dataAdmissao: true,
      tipoContrato: true,
      dataFimContrato: true,
      cpf: true,
      salarioBase: true,
      telegramChatId: true,
      empresa: { select: { nome: true, marca: { select: { nome: true } } } },
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
      ferias: {
        where: { status: { in: ["APROVADA", "PENDENTE"] } },
        select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
      },
      avaliacoesRecebidas: {
        where: { ciclo: { encerrado: false } },
        select: { status: true },
      },
      _count: { select: { sessoesPortal: true } },
      checklistIntegracao: { select: { item: true, concluido: true, prazo: true } },
    },
  });

  if (subordinados.length === 0) return null;

  const ciclosAbertos = await prisma.cicloAvaliacao.findMany({
    where: { empresaId: { in: [...new Set(subordinados.map((c) => c.empresaId))] }, encerrado: false },
    select: { empresaId: true },
  });
  const empresasComCiclo = new Set(ciclosAbertos.map((c) => c.empresaId));

  const paraTime: ColaboradorParaTime[] = subordinados.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresa: c.empresa.nome,
    setor: c.setor.nome,
    cargo: c.posicao.nome,
    dataAdmissao: c.dataAdmissao,
    tipoContrato: c.tipoContrato,
    dataFimContrato: c.dataFimContrato,
    semLider: c.supervisorId === null,
    semSalario: c.salarioBase === null || c.salarioBase === undefined,
    semCpf: !c.cpf,
    semTelegram: !c.telegramChatId,
    nuncaAcessouPortal: c._count.sessoesPortal === 0,
    ferias: c.ferias,
    temCicloAberto: empresasComCiclo.has(c.empresaId),
    avaliacoesCicloAberto: c.avaliacoesRecebidas,
    trilha: c.checklistIntegracao,
  }));

  const marcas = [...new Set(subordinados.map((c) => c.empresa.marca.nome))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return {
    time: montarMeuTime(paraTime, hojeUTC()),
    escopo: { cnpjs: new Set(subordinados.map((c) => c.empresaId)).size, marcas },
    linhas: subordinados,
  };
}
