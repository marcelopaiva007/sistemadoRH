import { requireGestorSetor } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { montarMeuTime, type ColaboradorParaTime } from "@/lib/meu-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TimeView } from "../[empresaId]/time/time-view";
import { MeuSetorView } from "./meu-setor-view";

export default async function MeuSetorPage() {
  const user = await requireGestorSetor();

  const setor = await prisma.setor.findUnique({ where: { id: user.setorAtivaId } });
  if (!setor) {
    return <p className="text-muted-foreground">Setor não encontrado.</p>;
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

  const time = eu?.colaboradorId ? await montarTimeDoGestor(eu.colaboradorId) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Setor — {setor.nome}</h1>
        <p className="text-muted-foreground">
          O seu time e os resultados agregados das pesquisas de clima do setor.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Meu time</h2>
        {!eu?.colaboradorId ? (
          <Alert>
            <AlertDescription>
              O seu login ainda não está ligado à sua ficha de colaborador, e por isso o sistema
              não sabe quem reporta a você. Peça ao RH para fazer a ligação em{" "}
              <strong>Cadastros → Usuários → Vincular</strong>. Os resultados de clima abaixo não
              dependem disso e já aparecem.
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
