import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { prisma } from "@/lib/prisma";
import { diferencaEmDiasUTC, formatarData, hojeUTC, paraInputDate } from "@/lib/datas";
import { SinaisView, type SinalNaTela } from "./sinais-view";

// Central de Sinais — alerta com dono, prazo e desfecho.
//
// Os detectores (lib/alertas.ts + radar de lib/anomalias.ts) gravam `Sinal`
// 1×/dia pelo cron alertas-rh; esta tela é onde o humano responde. Sem estado,
// alerta não é gestão, é ruído — um alerta sem "eu vi" e sem "virou plano"
// treina o time a ignorar.
//
// ESCOPO: sinais de CNPJ seguem `empresasVisiveis` estreitado pelo
// `?empresas=` da tela de Pendências (interseção, nunca amplia — mesma regra
// de Aprovações); sinais de grupo/marca (empresaId nulo) aparecem para todo
// mundo que entra aqui — o pico do grupo é história de todos os leitores, e
// escondê-lo de quem só enxerga um CNPJ esconderia o contexto do próprio CNPJ.
export default async function SinaisPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);
  const visiveis = await empresasVisiveis(usuario);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));
  const hoje = hojeUTC();

  const [sinais, usuarios] = await Promise.all([
    // `select` explícito, como toda a tela de RH — aqui não há salário nem
    // documento por construção (o Sinal só guarda agregado e frase), mas o
    // contrato de não usar `include` vale igual.
    prisma.sinal.findMany({
      where: { OR: [{ empresaId: null }, { empresaId: { in: escopo } }] },
      orderBy: { detectadoEm: "desc" },
      select: {
        id: true,
        tipo: true,
        nivelUnidade: true,
        unidadeNome: true,
        titulo: true,
        observado: true,
        esperado: true,
        recorte: true,
        gravidade: true,
        status: true,
        motivoDescarte: true,
        donoUserId: true,
        donoNome: true,
        prazo: true,
        silenciadoAte: true,
        detectadoEm: true,
        confirmadoEm: true,
      },
    }),
    // Dono é escolha MANUAL entre os usuários existentes — são 5 hoje, nenhum
    // com papel de gestor de setor, e User não tem vínculo com Colaborador:
    // qualquer escalonamento automático devolveria vazio em 100% dos casos.
      // Acessos de portal (funcionários sem login do sistema, criados pelo
      // módulo Delegações) ficam FORA desta lista: eles não operam o sistema,
      // e com algumas centenas deles a tela viraria uma lista de gente que
      // nunca vai entrar aqui. Ver lib/delegacoes/acesso-colaborador.ts.
    prisma.user.findMany({
      where: { ativo: true, role: { not: PAPEL_PORTAL } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  // Datas viram texto AQUI: um Date cruzando para o cliente volta a depender
  // do fuso do navegador (mesma decisão do painel).
  const naTela: SinalNaTela[] = sinais.map(s => ({
    id: s.id,
    tipo: s.tipo,
    nivelUnidade: s.nivelUnidade,
    unidadeNome: s.unidadeNome,
    titulo: s.titulo,
    observado: s.observado,
    esperado: s.esperado,
    recorte: s.recorte,
    gravidade: s.gravidade,
    status: s.status,
    motivoDescarte: s.motivoDescarte,
    donoUserId: s.donoUserId,
    donoNome: s.donoNome,
    prazoInput: paraInputDate(s.prazo),
    prazoRotulo: s.prazo ? formatarData(s.prazo) : null,
    silenciadoAteRotulo: s.silenciadoAte ? formatarData(s.silenciadoAte) : null,
    abertoDesde: formatarData(s.detectadoEm),
    diasAberto: Math.max(0, diferencaEmDiasUTC(hoje, s.detectadoEm)),
    confirmadoEm: formatarData(s.confirmadoEm),
  }));

  return <SinaisView empresaId={empresaId} sinais={naTela} usuarios={usuarios} />;
}
