import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, CheckCircle2, Compass } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireProcessosEmpresa } from "@/lib/processos-auth-guard";
import { escopoDeEmpresas } from "@/lib/rh-auth-guard";
import { diferencaEmDiasUTC, formatarData, hojeUTC } from "@/lib/datas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import { STATUS_COM_PRAZO_CORRENDO } from "@/lib/processos/pendencias";
import { PendenciasView, type PendenciaNaTela } from "./pendencias-view";

// A Central de Pendências — a tela de abertura do módulo, e não uma seção dentro
// dele. É ela que justifica o módulo existir: as outras telas guardam, esta cobra.
//
// Consolidada por padrão, como o resto do sistema: sem `?empresas=` na URL,
// mostra tudo que a pessoa enxerga. Com filtro, a INTERSEÇÃO — id digitado à
// mão não vira acesso.
//
// Nada aqui é calculado na leitura além dos dias restantes: as datas-alvo vêm
// materializadas do detector (lib/processos/pendencias.ts), porque as regras que
// as produzem mudam e um alerta antigo precisa continuar explicável.

/** Para onde o botão da linha leva, por tipo de pendência. */
function acaoDe(
  p: { tipo: string; origemTipo: string; origemId: string },
  base: string,
): { href: string | null; rotulo: string } {
  switch (p.tipo) {
    case "INDICAR_CONDUTOR":
      // Deep link: a tela de multas abre já no registro certo, com o painel de
      // indicação aberto. É a diferença entre um botão que resolve e um que
      // "abre para ver" — e este é o prazo mais caro do módulo.
      return { href: `${base}/frota/multas?foco=${p.origemId}`, rotulo: "Indicar condutor" };
    case "DEFESA_AUTUACAO":
      return { href: `${base}/frota/multas?foco=${p.origemId}`, rotulo: "Abrir defesa" };
    case "RECURSO_JARI":
      return { href: `${base}/frota/multas?foco=${p.origemId}`, rotulo: "Recorrer" };
    case "CNH_VENCENDO":
    case "TOXICOLOGICO":
      return { href: `${base}/frota/condutores`, rotulo: "Abrir condutor" };
    case "LICENCIAMENTO":
    case "IPVA":
    case "SEGURO":
    case "DOCUMENTO_VEICULO":
    case "NOVO_CRV":
    case "COMUNICACAO_VENDA":
      return { href: `${base}/frota`, rotulo: "Abrir veículo" };
    case "MANUTENCAO_PROGRAMADA":
      return { href: `${base}/frota/manutencoes`, rotulo: "Agendar revisão" };
    case "CADASTRO_INCOMPLETO":
      return { href: `${base}/frota`, rotulo: "Completar cadastro" };
    // `status=TODOS` não é enfeite: a lista de Contratos abre filtrada em
    // "Vigente", e os três detectores também acham contrato EM_RENOVACAO e
    // SUSPENSO. Sem o parâmetro, clicar no alerta levava a uma tela onde o
    // contrato do alerta simplesmente não estava.
    case "DENUNCIA_CONTRATO":
      return { href: `${base}/contratos?status=TODOS`, rotulo: "Decidir renovação" };
    case "ACAO_RENOVATORIA":
      return { href: `${base}/contratos?status=TODOS`, rotulo: "Abrir contrato" };
    case "REAJUSTE_CONTRATO":
      return { href: `${base}/contratos?status=TODOS`, rotulo: "Aplicar reajuste" };
    case "ALUGUEL_ATRASADO":
      return { href: `${base}/alugueis`, rotulo: "Ver recebimentos" };
    default:
      return { href: null, rotulo: "Abrir" };
  }
}

export default async function CentralPendenciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireProcessosEmpresa(empresaId);
  const escopo = await escopoDeEmpresas(usuario, empresasParam);

  const [empresa, pendencias, usuarios, totalVeiculos, totalContratos, empresas] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, marca: { select: { nome: true } } },
    }),
    prisma.pendencia.findMany({
      where: { empresaId: { in: escopo }, estado: { in: ["ABERTA", "EM_ANDAMENTO"] } },
      orderBy: { venceEm: "asc" },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        descricao: true,
        responsavelId: true,
        responsavelNome: true,
        severidade: true,
        venceEm: true,
        empresaId: true,
        origemTipo: true,
        origemId: true,
      },
    }),
    // Quem pode virar dono: usuário ativo de escritório. GESTOR_SETOR fica de
    // fora — não alcança o módulo, e nomeá-lo criaria pendência que ele não vê.
    prisma.user.findMany({
      where: { ativo: true, role: { in: ["ADMIN", "DIRETORIA", "RH_MANAGER"] } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.veiculo.count({ where: { empresaId: { in: escopo } } }),
    // Só o que os detectores observam. Contar ENCERRADO/CANCELADO fazia a
    // Central dizer "9 contratos acompanhados" sobre 7 contratos mortos que
    // nenhum alerta olha — número plausível e errado, que é o que este módulo
    // existe para não produzir.
    prisma.contrato.count({ where: { empresaId: { in: escopo }, status: { in: STATUS_COM_PRAZO_CORRENDO } } }),
    prisma.empresa.findMany({ where: { id: { in: escopo } }, select: { id: true, nome: true } }),
  ]);
  if (!empresa) notFound();

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const hoje = hojeUTC();
  const base = `/processos/${empresaId}`;

  const naTela: PendenciaNaTela[] = pendencias.map((p) => {
    const { href, rotulo } = acaoDe(p, base);
    return {
      id: p.id,
      tipo: p.tipo,
      titulo: p.titulo,
      descricao: p.descricao,
      responsavelId: p.responsavelId,
      responsavelNome: p.responsavelNome,
      severidade: p.severidade,
      diasRestantes: diferencaEmDiasUTC(p.venceEm, hoje),
      venceEmTexto: formatarData(p.venceEm),
      empresaNome: nomeDaEmpresa.get(p.empresaId) ?? "—",
      href,
      acaoRotulo: rotulo,
    };
  });

  // Sem dono sai dos outros blocos: aparecer duas vezes faria o total da tela
  // não fechar com a soma dos blocos, e é assim que um painel perde a confiança.
  // Pela mesma regra, os INDICADORES do topo contam exatamente o que os blocos
  // mostram — "Vencidas: 1" com o bloco de vencidas vazio é a contradição que
  // esta tela existe para não ter.
  const semDono = naTela.filter((p) => !p.responsavelId);
  const comDono = naTela.filter((p) => p.responsavelId);
  const vencidas = comDono.filter((p) => p.diasRestantes < 0);
  const proximas = comDono.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 7);
  const adiante = comDono.filter((p) => p.diasRestantes > 7 && p.diasRestantes <= 30);

  const foraDaJanela = comDono.length - vencidas.length - proximas.length - adiante.length;
  // "Em dia" é não ter nada na JANELA — vencida, por vencer em 30 dias, ou sem
  // dono. Pendência de daqui a 11 meses existe no banco e não nega o "em dia":
  // condicionar o cartão verde a zero pendências no total o tornava
  // inalcançável assim que o primeiro documento com data era cadastrado.
  const nadaNaJanela =
    semDono.length === 0 && vencidas.length === 0 && proximas.length === 0 && adiante.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {empresa.marca.nome} · {empresa.nome}
        </p>
        <h1 className="mt-1">Pendências</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tudo que vence, com data e dono. Uma lista só — as outras telas guardam, esta cobra.
        </p>
      </div>

      {totalVeiculos === 0 && totalContratos === 0 && naTela.length === 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Compass className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base">Comece cadastrando a frota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ainda não há veículo nenhum registrado, então não há o que vencer. A frota é o
              primeiro domínio do módulo porque é o único prejuízo{" "}
              <strong className="text-foreground">certo e recorrente</strong> que existe hoje:
              multa sem indicar o condutor em 30 dias custa 3× o valor, e isso acontece em toda
              multa não tratada.
            </p>
            <p>
              A ordem que funciona: cadastre os veículos, diga quem dirige cada um, e a partir daí
              toda multa que entrar já sabe a quem perguntar. Os contratos entram em seguida, pela
              mesma lógica — o que não está cadastrado não vence aqui.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={`${base}/frota`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Car className="size-4" />
                Cadastrar veículos
              </Link>
              <Link
                href={`${base}/frota/condutores`}
                className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Cadastrar condutores
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : nadaNaJanela ? (
        <Card className="border-success bg-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            <CardTitle className="text-base">Nada vencendo nos próximos 30 dias</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              {totalVeiculos} {totalVeiculos === 1 ? "veículo acompanhado" : "veículos acompanhados"} e{" "}
              {totalContratos} {totalContratos === 1 ? "contrato acompanhado" : "contratos acompanhados"}.
              Vale dizer o que este vazio significa e o que não significa: ele reflete o que{" "}
              <strong className="text-foreground">está cadastrado</strong>. Documento que ninguém
              registrou não vence aqui.
            </p>
            {foraDaJanela > 0 && (
              <p className="mt-2">
                {foraDaJanela} {foraDaJanela === 1 ? "vencimento acompanhado" : "vencimentos acompanhados"} para
                depois de 30 dias.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Indicador
              icone={<span className="text-destructive">●</span>}
              rotulo="Vencidas"
              valor={vencidas.length}
            />
            <Indicador rotulo="Vencem em 7 dias" valor={proximas.length} />
            <Indicador rotulo="Sem responsável" valor={semDono.length} />
          </div>

          <PendenciasView
            empresaId={empresaId}
            vencidas={vencidas}
            proximas={proximas}
            adiante={adiante}
            semDono={semDono}
            usuarios={usuarios}
          />

          {foraDaJanela > 0 && (
            <p className="text-xs text-muted-foreground">
              Mais {foraDaJanela} {foraDaJanela === 1 ? "pendência vence" : "pendências vencem"} depois
              de 30 dias. Ficam fora da lista para o que é urgente não se perder no meio do que não é.
            </p>
          )}
        </>
      )}
    </div>
  );
}
