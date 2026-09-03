"use client";

import { NavLateral } from "@/components/padroes/nav-lateral";

// Menu do módulo, no mesmo desenho das laterais de RH e Processos
// (components/padroes/nav-lateral.tsx, v1.155.0).
//
// O módulo responde a duas perguntas — "o que cobram de mim?" e "o que eu
// cobro dos outros?" — mais, para a Direção, uma terceira: "como está TUDO?".
// A tela de detalhe e o formulário de nova demanda não são itens de menu (um
// é destino de clique, o outro é ação de dentro da tela de quem delega).
//
// Sem `empresaId`: este módulo não é escopado por CNPJ, então `BASE` é uma
// constante em vez de prop (ver components/modulos.ts, escopadoPorEmpresa).
const ITENS = [
  { slug: "", label: "Recebidas" },
  { slug: "delegadas", label: "Delegadas por mim" },
  { slug: "reunioes", label: "Reuniões" },
  { slug: "painel", label: "Painel", soDirecao: true },
  { slug: "relatorio", label: "Relatório", soDirecao: true },
] as const;

const BASE = "/delegacoes";

export function DelegacoesNav({ souDirecao }: { souDirecao: boolean }) {
  const itens = ITENS.filter((i) => !("soDirecao" in i && i.soDirecao) || souDirecao).map((item) => ({
    href: item.slug ? `${BASE}/${item.slug}` : BASE,
    label: item.label,
    // "Recebidas" é a raiz: só acende com igualdade exata, senão acenderia em
    // toda tela do módulo, inclusive no detalhe de uma demanda delegada.
    exato: !item.slug,
  }));
  return <NavLateral grupos={[{ titulo: null, itens }]} />;
}
