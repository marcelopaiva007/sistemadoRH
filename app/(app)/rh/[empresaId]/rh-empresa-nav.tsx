"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavLateral } from "@/components/padroes/nav-lateral";

// Os grupos são os mesmos 5 blocos do artefato de escopo apresentado à
// diretoria — a tela reflete o plano, em vez de uma lista plana que só cresce
// a cada módulo novo. "Configuração" fica por último, separado: é o que se
// ajusta de vez em quando, não o que se usa todo dia.
const GRUPOS = [
  {
    titulo: "Ciclo de vida",
    itens: [
      { slug: "colaboradores", label: "Colaboradores" },
      { slug: "organograma", label: "Organograma" },
      { slug: "vagas", label: "Vagas" },
      { slug: "candidatos", label: "Talentos" },
      { slug: "integracoes", label: "Integrações" },
      { slug: "desligamentos", label: "Desligamentos" },
    ],
  },
  {
    titulo: "Departamento pessoal",
    itens: [
      { slug: "ponto", label: "Ponto Eletrônico" },
      { slug: "aprovacoes", label: "Aprovações" },
      { slug: "mensagens", label: "Mensagens" },
      { slug: "avisos-gestor", label: "Avisos ao gestor" },
      { slug: "vencimentos", label: "Vencimentos" },
      { slug: "ferias", label: "Férias" },
      { slug: "escalas", label: "Escalas" },
      { slug: "beneficios", label: "Benefícios" },
      // Ao lado de Benefícios porque o caso que a criou é o cartão de
      // benefícios — mas a tela serve para notebook, uniforme e crachá igual.
      { slug: "entregas", label: "Entregas" },
      { slug: "folha", label: "Folha" },
    ],
  },
  {
    titulo: "Desempenho & desenvolvimento",
    itens: [
      { slug: "avaliacoes", label: "Avaliações" },
      { slug: "metas", label: "Metas & PDI" },
      { slug: "treinamentos", label: "Treinamentos" },
      { slug: "reconhecimento", label: "Reconhecimento" },
      { slug: "pesquisas", label: "Pesquisas" },
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
      { slug: "conformidade", label: "Conformidade" },
      { slug: "acidentes", label: "Acidentes / CAT" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      // "Dashboard" e "Painel de clima" eram dois nomes genéricos ao lado do
      // slug `dashboard`, que é OUTRA tela — ninguém acertava qual link abria
      // o quê. Agora cada rótulo diz o recorte: o executivo é do grupo, o de
      // NR-01 é de risco psicossocial.
      { slug: "painel", label: "Painel executivo" },
      { slug: "placar", label: "Placar do grupo" },
      // O zoom seguinte ao Placar: o grupo → o CNPJ → o SETOR. Mesmo motor da
      // seção "Números do setor" que o gestor vê em /rh/meu-setor.
      { slug: "painel-setor", label: "Painel do setor" },
      // O que o radar de desvio e os detectores de lib/alertas.ts encontram
      // vira cartão aqui, com dono e prazo — sem isso, alerta é ruído que o
      // time aprende a ignorar em um mês.
      { slug: "sinais", label: "Central de Sinais" },
      { slug: "lideranca", label: "Malha de liderança" },
      // A leitura de UMA equipe, pessoa a pessoa (a Malha acima é a estrutura
      // inteira). Tem seletor de setor porque não existe papel de gestor de
      // setor no sistema — o gestor real vê o próprio recorte pelo portal.
      { slug: "time", label: "Meu time" },
      // A tela NÃO mostra clima: escolher uma pesquisa de clima nela não
      // renderiza nada, só devolve um link para Pesquisas. O nome antigo
      // ("Painel de clima") prometia o que ela não entrega — e clima e risco
      // psicossocial são instrumentos diferentes, com obrigação legal
      // diferente. O rótulo passa a ser o da norma.
      { slug: "dashboard", label: "Risco psicossocial (NR-01)" },
      { slug: "planos-acao", label: "Planos de ação" },
      { slug: "relatorios", label: "Relatórios" },
      { slug: "assistente", label: "Assistente" },
    ],
  },
  {
    titulo: "Configuração",
    itens: [
      // "Visão geral" é o hub: um cartão por área com o status real (canal
      // ligado?, horário ajustado?) — o mapa de tudo que se configura.
      { slug: "configuracoes", label: "Visão geral" },
      { slug: "setores", label: "Setores" },
      { slug: "posicoes", label: "Cargos" },
      // Estrutura é a única entrada aqui que configura o GRUPO, não a empresa
      // aberta. Fica neste grupo mesmo assim porque é onde se procura por ela.
      { slug: "estrutura", label: "Marcas & CNPJs" },
      { slug: "canais", label: "Canais de envio" },
      { slug: "lembretes", label: "Lembretes" },
      { slug: "tipos-beneficio", label: "Tipos de benefício" },
      { slug: "catalogos", label: "Catálogos" },
    ],
  },
  {
    // Importações e Auditoria moravam em "Configuração", mas não configuram
    // nada: uma é ferramenta de carga de dados, a outra é trilha de leitura.
    // Separadas para "Configuração" dizer só o que de fato se ajusta.
    titulo: "Administração",
    itens: [
      { slug: "importacoes", label: "Importações" },
      { slug: "auditoria", label: "Auditoria" },
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
/** As telas do módulo, para a busca global (components/busca-global.tsx). */
export const TELAS_RH = GRUPOS.flatMap((g) => g.itens.map((i) => ({ slug: i.slug, label: i.label, grupo: g.titulo })));

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

  // Contador de "Pendências" no topo da lateral (v1.155.0): UMA busca por CNPJ
  // aberto, sem polling e sem depender da rota — são ~27 consultas agrupadas
  // (lib/pendencias.ts), e a tela de Pendências continua sendo a verdade.
  const [totalPendencias, setTotalPendencias] = useState<number | null>(null);
  useEffect(() => {
    let ativo = true;
    fetch(`/api/rh/${empresaId}/pendencias-total`)
      .then((r) => (r.ok ? (r.json() as Promise<{ total?: number }>) : null))
      .then((d) => {
        if (ativo && d && typeof d.total === "number") setTotalPendencias(d.total);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  const grupos = GRUPOS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.itens.map((item) => ({
      href: `${base}/${item.slug}`,
      label: item.label,
      badge:
        item.slug === "mensagens" && mensagensAbertas > 0 ? (
          // Contador, não pontinho: o RH decide se abre agora pela quantidade.
          // Vermelho porque há uma pessoa esperando do outro lado — mesma
          // régua do grupo DECIDIR das pendências. O `title` declara o
          // escopo: este número é de TODAS as empresas que o usuário enxerga
          // (o mesmo da tela que abre ao clicar), enquanto o contador de
          // Pendências acima soma só o CNPJ aberto — os dois podem diferir
          // sem estar errados.
          <span
            title={`${mensagensAbertas} sem resposta em todas as empresas que você enxerga — o contador de Pendências soma só este CNPJ.`}
            className="ml-auto shrink-0 bg-primary px-1.5 py-0.5 text-[10px] leading-none font-bold tabular-nums text-primary-foreground"
          >
            {mensagensAbertas}
          </span>
        ) : undefined,
    })),
  }));

  return (
    <NavLateral
      topo={{ href: base, label: "Pendências", exato: true, contador: totalPendencias }}
      grupos={grupos}
    />
  );
}
