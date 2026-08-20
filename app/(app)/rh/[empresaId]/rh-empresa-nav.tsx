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
  Trophy,
  UserCog,
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
      { slug: "papeis", label: "Papéis e permissões", icon: UserCog },
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

  return (
    <nav className="space-y-4 pb-6">
      <Link
        href={base}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
          pathname === base
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <ListChecks className="size-4" />
        Pendências
      </Link>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
            {grupo.titulo}
          </p>
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const href = `${base}/${item.slug}`;
              const ativo = pathname.startsWith(href);
              const Icon = item.icon;
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      // Item ativo marcado por barra + tinta leve, não por
                      // bloco sólido: com 23 itens na lateral, um retângulo
                      // azul cheio grita mais que o conteúdo da tela.
                      "relative flex items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-sm transition-colors",
                      "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:transition-colors",
                      ativo
                        ? "bg-primary/8 text-primary font-medium before:bg-primary"
                        : "text-muted-foreground before:bg-transparent hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
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
