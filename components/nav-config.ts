import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  SlidersHorizontal,
  ClipboardList,
  Upload,
  Lock,
  BarChart3,
  HeartHandshake,
  UserCog,
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
  { href: "/regras", label: "Regras de Bonificação", icon: SlidersHorizontal },
  { href: "/lancamentos", label: "Lançamentos", icon: ClipboardList },
  { href: "/importar", label: "Importar Planilha/CSV", icon: Upload },
  { href: "/importar/elleven", label: "Importar do elleven", icon: Upload },
  { href: "/fechamento", label: "Fechamento Mensal", icon: Lock },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

export const diretoriaNav: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/fechamento", label: "Fechamentos", icon: Lock },
];

const rhHubItem: NavItem = { href: "/rh", label: "RH — Clima Organizacional", icon: HeartHandshake };
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários", icon: UserCog };
const painelItem: NavItem = { href: "/", label: "Painel", icon: LayoutDashboard };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

// Lookup por role — adminNav/diretoriaNav continuam intactos (referenciados
// diretamente), RH_MANAGER/GESTOR_SETOR ganham navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: [...adminNav, rhHubItem, usuariosItem],
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [painelItem, rhHubItem],
  GESTOR_SETOR: [painelItem, meuSetorItem],
};
