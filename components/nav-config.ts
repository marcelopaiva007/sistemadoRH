import type { LucideIcon } from "lucide-react";
import { Activity, HeartHandshake, History, UserCog, LayoutDashboard } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// Menu do topo. Deliberadamente curto: até 25/07/2026 havia um item
// "RH — Clima Organizacional" e TODO o sistema pendurava dentro dele — nome de
// quando o produto era só pesquisa de clima. A raiz já é a lista de empresas e
// a navegação de verdade é a lateral dentro da empresa. Área nova de RH entra
// na lateral, não aqui — aqui só entra o que não pertence a empresa nenhuma
// (administração do sistema em si, como Usuários e Atualizações).
//
// E MÓDULO novo também não entra aqui. Desde 23/08/2026 a barra de topo tem
// dois níveis, e eles respondem a perguntas diferentes: o seletor ao lado do
// logo (components/seletor-modulo.tsx) troca de MÓDULO — o conjunto em que as
// telas vivem —, e esta lista é a navegação de dentro do módulo. Pôr
// "Processos & Ativos" como um item aqui o rebaixaria a uma tela entre
// Usuários e Atualizações, que é o mesmo erro do "RH — Clima Organizacional".
const inicioItem: NavItem = { href: "/", label: "Início", icon: LayoutDashboard };
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários", icon: UserCog };
const produtividadeItem: NavItem = { href: "/produtividade", label: "Produtividade RH", icon: Activity };
const atualizacoesItem: NavItem = { href: "/atualizacoes", label: "Atualizações", icon: History };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

export const adminNav: NavItem[] = [inicioItem, usuariosItem, produtividadeItem, atualizacoesItem];
// Diretoria também gere usuários desde 31/07/2026 — ver requireGestaoUsuarios
// em lib/auth-guard.ts. Sem o item aqui a permissão existiria sem caminho.
// Atualizações e Produtividade RH seguem o mesmo par de papéis da área (ADMIN + DIRETORIA).
export const diretoriaNav: NavItem[] = [inicioItem, usuariosItem, produtividadeItem, atualizacoesItem];

// Lookup por role — RH_MANAGER/GESTOR_SETOR têm navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: adminNav,
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [inicioItem],
  GESTOR_SETOR: [meuSetorItem],
};
