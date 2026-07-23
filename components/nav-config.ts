import type { LucideIcon } from "lucide-react";
import { HeartHandshake, UserCog } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const rhHubItem: NavItem = { href: "/rh", label: "RH — Clima Organizacional", icon: HeartHandshake };
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários", icon: UserCog };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

export const adminNav: NavItem[] = [rhHubItem, usuariosItem];
export const diretoriaNav: NavItem[] = [rhHubItem];

// Lookup por role — RH_MANAGER/GESTOR_SETOR têm navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: adminNav,
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [rhHubItem],
  GESTOR_SETOR: [meuSetorItem],
};
