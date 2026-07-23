import type { LucideIcon } from "lucide-react";
import { HeartHandshake, UserCog, LayoutDashboard } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const inicioItem: NavItem = { href: "/", label: "Início", icon: LayoutDashboard };
const rhHubItem: NavItem = { href: "/rh", label: "RH — Clima Organizacional", icon: HeartHandshake };
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários", icon: UserCog };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

export const adminNav: NavItem[] = [inicioItem, rhHubItem, usuariosItem];
export const diretoriaNav: NavItem[] = [inicioItem, rhHubItem];

// Lookup por role — RH_MANAGER/GESTOR_SETOR têm navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: adminNav,
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [inicioItem, rhHubItem],
  GESTOR_SETOR: [meuSetorItem],
};
