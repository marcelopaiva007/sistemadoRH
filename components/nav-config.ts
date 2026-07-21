import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  UserCog,
  SlidersHorizontal,
  ClipboardList,
  Upload,
  Lock,
  BarChart3,
  Target,
  Send,
  Smartphone,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const adminNav: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/cadastros/cidades", label: "Cidades", icon: Building2 },
  { href: "/cadastros/equipes", label: "Equipes", icon: UsersRound },
  { href: "/cadastros/funcionarios", label: "Funcionários", icon: Users },
  { href: "/cadastros/usuarios", label: "Usuários", icon: UserCog },
  { href: "/regras", label: "Regras de Bonificação", icon: SlidersHorizontal },
  { href: "/lancamentos", label: "Lançamentos", icon: ClipboardList },
  { href: "/metas", label: "Acompanhamento de Metas", icon: Target },
  { href: "/cadastros/telegram", label: "Vincular Telegram", icon: Send },
  { href: "/importar", label: "Importar Planilha/CSV", icon: Upload },
  { href: "/importar/elleven", label: "Importar do elleven", icon: Upload },
  { href: "/importar/chip", label: "Vendas de Chip (Móvel)", icon: Smartphone },
  { href: "/fechamento", label: "Fechamento Mensal", icon: Lock },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

export const diretoriaNav: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/metas", label: "Acompanhamento de Metas", icon: Target },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/fechamento", label: "Fechamentos", icon: Lock },
];
