import type { LucideIcon } from "lucide-react";
import { HeartHandshake, UserCog, LayoutDashboard } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// Menu do topo. Deliberadamente curto: até 25/07/2026 havia um item
// "RH — Clima Organizacional" e TODO o sistema pendurava dentro dele — nome de
// quando o produto era só pesquisa de clima. O sistema É o RH, então a raiz já
// é a lista de empresas e a navegação de verdade é a lateral dentro da
// empresa. Módulo novo entra na lateral, não aqui.
const inicioItem: NavItem = { href: "/", label: "Início", icon: LayoutDashboard };
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários", icon: UserCog };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

export const adminNav: NavItem[] = [inicioItem, usuariosItem];
export const diretoriaNav: NavItem[] = [inicioItem];

// Lookup por role — RH_MANAGER/GESTOR_SETOR têm navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: adminNav,
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [inicioItem],
  GESTOR_SETOR: [meuSetorItem],
};
