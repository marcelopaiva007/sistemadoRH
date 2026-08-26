"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertOctagon,
  Award,
  BellRing,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ContactRound,
  CreditCard,
  LibraryBig,
  Tags,
  FileBarChart,
  FileUp,
  GraduationCap,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageCircle,
  Network,
  PackageCheck,
  Palmtree,
  Receipt,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  Trophy,
  Star,
  Target,
  Users,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Os grupos são os mesmos 5 blocos do artefato de escopo apresentado à
// diretoria — a tela reflete o plano, em vez de uma lista plana que só cresce
// a cada módulo novo. "Configuração" fica por último, separado: é o que se
// ajusta de vez em quando, não o que se usa todo dia.
const GRUPOS = [
  {
    titulo: "Ciclo de vida",
    itens: [
      { slug: "colaboradores", label: "Colaboradores", icon: Users },
      { slug: "organograma", label: "Organograma", icon: Network },
      { slug: "vagas", label: "Vagas", icon: Briefcase },
      { slug: "candidatos", label: "Talentos", icon: Search },
      { slug: "integracoes", label: "Integrações", icon: Rocket },
      { slug: "desligamentos", label: "Desligamentos", icon: LogOut },
    ],
  },
  {
    titulo: "Departamento pessoal",
    itens: [
      { slug: "ponto", label: "Ponto Eletrônico", icon: Clock },
      { slug: "aprovacoes", label: "Aprovações", icon: CheckSquare },
      { slug: "mensagens", label: "Mensagens", icon: MessageCircle },
      { slug: "avisos-gestor", label: "Avisos ao gestor", icon: BellRing },
      { slug: "vencimentos", label: "Vencimentos", icon: CalendarDays },
      { slug: "ferias", label: "Férias", icon: Palmtree },
      { slug: "escalas", label: "Escalas", icon: ClipboardCheck },
      { slug: "beneficios", label: "Benefícios", icon: CreditCard },
      // Ao lado de Benefícios porque o caso que a criou é o cartão de
      // benefícios — mas a tela serve para notebook, uniforme e crachá igual.
      { slug: "entregas", label: "Entregas", icon: PackageCheck },
      { slug: "folha", label: "Folha", icon: Receipt },
    ],
  },
  {
    titulo: "Desempenho & desenvolvimento",
    itens: [
      { slug: "avaliacoes", label: "Avaliações", icon: Star },
      { slug: "metas", label: "Metas & PDI", icon: Target },
      { slug: "treinamentos", label: "Treinamentos", icon: GraduationCap },
      { slug: "reconhecimento", label: "Reconhecimento", icon: Award },
      { slug: "pesquisas", label: "Pesquisas", icon: Activity },
      // "Planos de ação" saiu daqui para "Gestão": ele deixou de ser o destino
      // do que sai de uma avaliação e virou o destino de tudo — anomalia de
      // desligamento, span sobrecarregado, férias vencidas. Enquanto morava em
      // "Desempenho", quem chegava pelo Placar ou pela Liderança não achava
      // onde registrar a decisão.
    ],
  },
  {
    titulo: "Saúde & segurança",
    itens: [
      { slug: "conformidade", label: "Conformidade", icon: ShieldCheck },
      { slug: "acidentes", label: "Acidentes / CAT", icon: AlertOctagon },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      // "Dashboard" e "Painel de clima" eram dois nomes genéricos ao lado do
      // slug `dashboard`, que é OUTRA tela — ninguém acertava qual link abria
      // o quê. Agora cada rótulo diz o recorte: o executivo é do grupo, o de
      // NR-01 é de risco psicossocial.
      { slug: "painel", label: "Painel executivo", icon: LayoutDashboard },
      { slug: "placar", label: "Placar do grupo", icon: Trophy },
      // O zoom seguinte ao Placar: o grupo → o CNPJ → o SETOR. Mesmo motor da
      // seção "Números do setor" que o gestor vê em /rh/meu-setor.
      { slug: "painel-setor", label: "Painel do setor", icon: Gauge },
      // O que o radar de desvio e os detectores de lib/alertas.ts encontram
      // vira cartão aqui, com dono e prazo — sem isso, alerta é ruído que o
      // time aprende a ignorar em um mês.
      { slug: "sinais", label: "Central de Sinais", icon: BellRing },
      { slug: "lideranca", label: "Malha de liderança", icon: Waypoints },
      // A leitura de UMA equipe, pessoa a pessoa (a Malha acima é a estrutura
      // inteira). Tem seletor de setor porque não existe papel de gestor de
      // setor no sistema — o gestor real vê o próprio recorte pelo portal.
      { slug: "time", label: "Meu time", icon: ContactRound },
      // A tela NÃO mostra clima: escolher uma pesquisa de clima nela não
      // renderiza nada, só devolve um link para Pesquisas. O nome antigo
      // ("Painel de clima") prometia o que ela não entrega — e clima e risco
      // psicossocial são instrumentos diferentes, com obrigação legal
      // diferente. O rótulo passa a ser o da norma.
      { slug: "dashboard", label: "Risco psicossocial (NR-01)", icon: ShieldAlert },
      { slug: "planos-acao", label: "Planos de ação", icon: ClipboardList },
      { slug: "relatorios", label: "Relatórios", icon: FileBarChart },
      { slug: "assistente", label: "Assistente", icon: Bot },
    ],
  },
  {
    titulo: "Configuração",
    itens: [
      // "Visão geral" é o hub: um cartão por área com o status real (canal
      // ligado?, horário ajustado?) — o mapa de tudo que se configura.
      { slug: "configuracoes", label: "Visão geral", icon: Settings },
      { slug: "setores", label: "Setores", icon: UsersRound },
      { slug: "posicoes", label: "Cargos", icon: ListChecks },
      // Estrutura é a única entrada aqui que configura o GRUPO, não a empresa
      // aberta. Fica neste grupo mesmo assim porque é onde se procura por ela.
      { slug: "estrutura", label: "Marcas & CNPJs", icon: Building2 },
      { slug: "canais", label: "Canais de envio", icon: Send },
      { slug: "lembretes", label: "Lembretes", icon: Clock },
      { slug: "tipos-beneficio", label: "Tipos de benefício", icon: Tags },
      { slug: "catalogos", label: "Catálogos", icon: LibraryBig },
    ],
  },
  {
    // Importações e Auditoria moravam em "Configuração", mas não configuram
    // nada: uma é ferramenta de carga de dados, a outra é trilha de leitura.
    // Separadas para "Configuração" dizer só o que de fato se ajusta.
    titulo: "Administração",
    itens: [
      { slug: "importacoes", label: "Importações", icon: FileUp },
      { slug: "auditoria", label: "Auditoria", icon: History },
      // "Papéis e permissões" saiu daqui em 26/08/2026: o cadastro de acesso é
      // ÚNICO e dos dois sistemas, e mora no topo ("Usuários e perfis" →
      // /cadastros). A rota antiga redireciona para /cadastros/perfis.
    ],
  },
] as const;

/**
 * slug → rótulo do módulo, derivado dos MESMOS GRUPOS que desenham o menu.
 *
 * A trilha (components/trilha.tsx) lê daqui em vez de manter uma segunda
 * lista: nomear o módulo em dois lugares garante que um dia o menu diga
 * "Talentos" e a trilha diga "Candidatos" — o slug é o mesmo, o usuário é que
 * fica sem saber se está na mesma tela.
 */
export const ROTULO_DO_MODULO: Record<string, string> = Object.fromEntries(
  GRUPOS.flatMap(g => g.itens.map(i => [i.slug, i.label]))
);

export function RHEmpresaNav({ empresaId }: { empresaId: string }) {
  const pathname = usePathname();
  const base = `/rh/${empresaId}`;

  // Badge de "Mensagens": quantas do Fale com o RH ainda estão sem resposta.
  // Busca da API (não vem de prop do layout: o layout não re-renderiza a cada
  // navegação, e o número congelaria no primeiro carregamento). Reconsulta a
  // cada troca de tela — quem responde uma mensagem e navega vê o badge cair
  // na hora — e a cada minuto parado, para mensagem nova aparecer sem F5.
  const [mensagensAbertas, setMensagensAbertas] = useState(0);
  useEffect(() => {
    let ativo = true;
    const buscar = async () => {
      try {
        const r = await fetch(`/api/rh/${empresaId}/mensagens-abertas`);
        if (!r.ok) return;
        const dados = (await r.json()) as { abertas?: number };
        if (ativo) setMensagensAbertas(dados.abertas ?? 0);
      } catch {
        // Rede falhou: mantém o último número conhecido em vez de zerar — um
        // badge que pisca para 0 a cada oscilação diria "tudo respondido" sem
        // ser verdade.
      }
    };
    buscar();
    const intervalo = setInterval(buscar, 60_000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [empresaId, pathname]);

  // Duas formas, um componente só. No computador é a coluna lateral agrupada
  // por área; no celular vira UMA FAIXA HORIZONTAL rolável.
  //
  // O layout já pedia isso ("no celular o menu vira uma barra rolável no topo")
  // e envolvia este componente num `overflow-x-auto`, mas envolver uma lista
  // VERTICAL em rolagem horizontal não a deita: no telefone os 23 itens
  // empilhavam e o conteúdo da tela começava depois de uma tela inteira de
  // menu. É o mesmo formato que `processos-nav.tsx` já usa — a diferença é que
  // lá foi escrito assim desde o começo.
  return (
    <nav className="flex gap-1 pb-2 md:flex-col md:gap-0 md:space-y-4 md:pb-6">
      <Link
        href={base}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
          pathname === base
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <ListChecks className="size-4" />
        Pendências
      </Link>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="flex gap-1 md:block md:gap-0">
          {/* O título do grupo só existe na coluna: numa faixa horizontal ele
              viraria mais um item para rolar, sem levar a lugar nenhum. */}
          <p className="hidden px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase md:block">
            {grupo.titulo}
          </p>
          <ul className="flex gap-1 md:block md:gap-0 md:space-y-0.5">
            {grupo.itens.map((item) => {
              const href = `${base}/${item.slug}`;
              // Igualdade ou prefixo COM barra — startsWith puro acendia dois
              // itens quando um slug é prefixo do outro ("painel" acendia
              // junto com "painel-setor"). Mesma regra do nav de Processos.
              const ativo = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = item.icon;
              return (
                <li key={item.slug} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      // Item ativo marcado por barra + tinta leve, não por
                      // bloco sólido: com 23 itens na lateral, um retângulo
                      // azul cheio grita mais que o conteúdo da tela.
                      "relative flex items-center gap-2 rounded-md py-1.5 pr-2 pl-2 text-sm whitespace-nowrap transition-colors md:pl-3",
                      // A barrinha do item ativo é só da coluna: numa faixa
                      // horizontal ela viraria um risco solto entre pílulas.
                      "md:before:absolute md:before:inset-y-1 md:before:left-0 md:before:w-0.5 md:before:rounded-full md:before:transition-colors",
                      // `dark:text-foreground` no item ativo: no escuro, a cor da MARCA como texto
                      // dava 3,82 de contraste (mínimo 4,5) — o item selecionado era o
                      // menos legível da lista. E não dá para consertar escolhendo um tom:
                      // `--primary` é a cor da marca, muda por empresa, e o próximo logo
                      // que entrar traz o problema de volta. A marca continua marcando o
                      // item ativo pela barra e pelo fundo; só o texto passa a ser o do
                      // tema, que o tema garante legível.
                      ativo
                        ? "bg-primary/8 text-primary font-medium md:before:bg-primary dark:text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground md:before:bg-transparent",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="md:truncate">{item.label}</span>
                    {item.slug === "mensagens" && mensagensAbertas > 0 && (
                      // Contador, não pontinho: o RH decide se abre agora pela
                      // quantidade. Vermelho porque há uma pessoa esperando do
                      // outro lado — mesma régua do grupo DECIDIR das
                      // pendências. O `title` declara o escopo: este número é
                      // de TODAS as empresas que o usuário enxerga (o mesmo da
                      // tela que abre ao clicar), enquanto o cartão "Mensagem
                      // sem resposta" da tela de Pendências soma só a marca ou
                      // o filtro atual — os dois podem diferir sem estar
                      // errados, e sem o rótulo isso lia como bug.
                      <span
                        title={`${mensagensAbertas} sem resposta em todas as empresas que você enxerga — o cartão de Pendências soma só a marca ou o filtro atual.`}
                        className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums text-white"
                      >
                        {mensagensAbertas}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
