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
// "Usuários e perfis" desde 26/08/2026: o item abre o cadastro ÚNICO de acesso
// (/cadastros — usuários e perfis de acesso em abas), que serve OS DOIS
// sistemas. É o perfil que decide se o acesso cobre os dois ou telas de um só.
const usuariosItem: NavItem = { href: "/usuarios", label: "Usuários e perfis", icon: UserCog };
const produtividadeItem: NavItem = { href: "/produtividade", label: "Produtividade RH", icon: Activity };
const atualizacoesItem: NavItem = { href: "/atualizacoes", label: "Atualizações", icon: History };
const meuSetorItem: NavItem = { href: "/rh/meu-setor", label: "Meu Setor", icon: HeartHandshake };

// v1.155.0: a barra virou UMA linha (Modernist). As duas listas abaixo
// continuam sendo a fonte por papel, mas as duas alimentam o MENU DO AVATAR
// (components/app-topbar.tsx), não mais duas linhas da barra. A divisão
// linha 1 / linha 2 descrita a seguir é a história de como chegaram aqui.
//
// A barra tinha DOIS níveis, e desde 26/08/2026 eles se dividiam assim (pedido
// do dono do sistema): a LINHA 1 é a área do que pertence a TODOS os sistemas —
// o seletor de sistema, o de marca/CNPJ, e a administração global (usuários e
// perfis, atualizações), ao lado do nome dos sistemas. A LINHA 2 é a navegação
// de páginas soltas do usuário logado (início, produtividade). O que é de UM
// sistema continua no menu de dentro dele.
export const globalNavByRole: Record<string, NavItem[]> = {
  // Diretoria também gere usuários desde 31/07/2026 — ver requireGestaoUsuarios
  // em lib/auth-guard.ts. Sem o item aqui a permissão existiria sem caminho.
  // Atualizações desceu para a linha 2 a pedido do dono (26/08/2026): na linha
  // 1 fica só o cadastro de acesso, ao lado do nome dos sistemas.
  ADMIN: [usuariosItem],
  DIRETORIA: [usuariosItem],
  RH_MANAGER: [],
  GESTOR_SETOR: [],
};

export const adminNav: NavItem[] = [inicioItem, produtividadeItem, atualizacoesItem];
export const diretoriaNav: NavItem[] = [inicioItem, produtividadeItem, atualizacoesItem];

// Lookup por role — RH_MANAGER/GESTOR_SETOR têm navegação própria e enxuta.
export const navByRole: Record<string, NavItem[]> = {
  ADMIN: adminNav,
  DIRETORIA: diretoriaNav,
  RH_MANAGER: [inicioItem],
  GESTOR_SETOR: [meuSetorItem],
};
