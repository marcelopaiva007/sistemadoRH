// Motor de cobrança das PENDÊNCIAS DO PRÓPRIO RH — não confundir com
// lib/regua-cobranca.ts, que cobra COLABORADOR para responder pesquisa. Este
// cobra quem trabalha no RH (RH_MANAGER) sobre o que ficou parado: aprovações,
// documentos a conferir, CAT sem emitir etc. — o mesmo catálogo de
// lib/pendencias.ts que já alimenta o card "Pendências" da tela inicial.
//
// Desenho, decidido em 07/08/2026: e-mail diário (horário configurável em
// Configuração → Lembretes, mesmo mecanismo dos demais crons de comunicação —
// ver lib/cron-horario.ts) para cada RH_MANAGER ativo, com o total de
// pendências da marca inteira que ele responde (mesma regra de escopo da tela
// inicial: lib/escopo-marca.ts), sempre que esse total for > 0. Sem escada de
// dias como a régua de pesquisa: aqui "parado" é medido pela repetição — se a
// pendência não sumir, o e-mail volta amanhã, até alguém resolver. O gestor
// (role ADMIN) entra em cópia em toda cobrança.
import { PAPEIS_DE_RESTRICAO } from "@/lib/grupo";
import { diaBrasilia } from "@/lib/datas";
import { prisma, type Cliente } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import {
  pendenciasDaEmpresa,
  totalPendencias,
  ROTULOS_PENDENCIA,
  type Pendencias,
} from "@/lib/pendencias";

// Os rótulos mudaram de casa em 20/08/2026: viviam aqui como "cópia
// deliberada" dos da tela, até a tela do grupo precisar deles também (o
// detalhamento do cartão de marca enumerava 6 chaves fixas e ficava vazio
// quando a pendência era de outro tipo). Três consumidores é registro, não
// cópia — a fonte é lib/pendencias.ts, ao lado do próprio tipo.
export { ROTULOS_PENDENCIA };

export type ResultadoCobrancaRH = { avaliados: number; enviados: number; deduplicados: number; erros: number };

/**
 * @param apenas Restringe a quais User.id rodar — existe para o smoke poder
 *   testar sem mandar e-mail de verdade para todo RH_MANAGER da base, mesmo
 *   risco que scripts/smoke-regua-cobranca.ts documenta para a régua de
 *   pesquisa: sem isto, rodar o teste dispara cobrança real.
 */
export async function executarCobrancaPendenciasRH(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
  apenas?: string[],
): Promise<ResultadoCobrancaRH> {
  // Cópia para os ADMINs do MESMO GRUPO da pessoa cobrada (sociedade —
  // lib/grupo.ts): o ADMIN de um grupo não recebe a conta do outro.
  const gestores = await cliente.user.findMany({
    where: {
      role: "ADMIN",
      ativo: true,
      email: { not: null },
      grupoId: { not: null },
    },
    select: { id: true, email: true, grupoId: true },
  });
  // ADMIN preso a algumas marcas pela tela de admin (lib/grupo.ts,
  // `direcaoRestrita`) só recebe cópia de quem trabalha APENAS nessas marcas:
  // o e-mail soma pendências de todas as empresas da pessoa cobrada, e uma
  // cópia "parcial" mostraria número de marca que esse ADMIN não enxerga.
  const marcadas = gestores.length
    ? await cliente.userMarca.findMany({
        where: { userId: { in: gestores.map((g) => g.id) }, ativo: true, role: { in: PAPEIS_DE_RESTRICAO } },
        select: { userId: true, marcaId: true, marca: { select: { grupoId: true } } },
      })
    : [];
  const marcasDoGestor = new Map<string, Set<string>>();
  for (const v of marcadas) {
    const gestor = gestores.find((g) => g.id === v.userId);
    // Marca de outro grupo não restringe nada — não dá acesso nenhum.
    if (!gestor || v.marca.grupoId !== gestor.grupoId) continue;
    const conjunto = marcasDoGestor.get(v.userId) ?? new Set<string>();
    conjunto.add(v.marcaId);
    marcasDoGestor.set(v.userId, conjunto);
  }
  const copiaDoGrupo = (grupoId: string | null, marcasDaPessoa: Set<string>) =>
    gestores
      .filter((g) => grupoId !== null && g.grupoId === grupoId)
      .filter((g) => {
        const marcas = marcasDoGestor.get(g.id);
        return !marcas || [...marcasDaPessoa].every((m) => marcas.has(m));
      })
      .map((g) => g.email)
      .filter((e): e is string => Boolean(e));

  const vinculos = await cliente.userEmpresa.findMany({
    where: { role: "RH_MANAGER", ativo: true, ...(apenas ? { userId: { in: apenas } } : {}) },
    select: {
      empresaId: true,
      user: {
        select: {
          id: true,
          nome: true,
          email: true,
          ativo: true,
          grupoId: true,
        },
      },
      empresa: { select: { marcaId: true, marca: { select: { grupoId: true } } } },
    },
  });

  // Uma pessoa pode ter vínculo com mais de uma empresa — o e-mail é UM só
  // por pessoa, cobrindo tudo que ela responde, não um por CNPJ.
  const porUsuario = new Map<
    string,
    {
      nome: string;
      email: string;
      grupoId: string | null;
      empresaIds: Set<string>;
      marcaIds: Set<string>;
    }
  >();
  for (const v of vinculos) {
    if (!v.user.ativo || !v.user.email) continue;
    // Vínculo antigo com CNPJ de OUTRO grupo não conta — a pessoa nem enxerga
    // esse CNPJ na tela (empresasVisiveis), então também não é cobrada por ele.
    if (!v.user.grupoId || v.empresa.marca.grupoId !== v.user.grupoId) continue;
    const entrada = porUsuario.get(v.user.id) ?? {
      nome: v.user.nome,
      email: v.user.email,
      grupoId: v.user.grupoId,
      empresaIds: new Set<string>(),
      marcaIds: new Set<string>(),
    };
    entrada.empresaIds.add(v.empresaId);
    entrada.marcaIds.add(v.empresa.marcaId);
    porUsuario.set(v.user.id, entrada);
  }

  let avaliados = 0;
  let enviados = 0;
  let deduplicados = 0;
  let erros = 0;

  for (const [userId, dados] of porUsuario) {
    avaliados++;
    try {
      // Expande cada empresa vinculada para a marca inteira (mesma regra da
      // tela inicial) e deduplica: duas empresas da mesma marca não dobram a
      // conta, e uma pessoa com vínculo em duas marcas soma as duas.
      const escopo = new Set<string>();
      for (const empresaId of dados.empresaIds) {
        const daMarca = await empresasDaMesmaMarca(empresaId, cliente);
        daMarca.forEach((id) => escopo.add(id));
      }

      // O escopo da pessoa é também o que ela enxerga: a Caixa só conta
      // arquivo que ela consegue abrir.
      const pendencias = await pendenciasDaEmpresa([...escopo], cliente, [...escopo]);
      const total = totalPendencias(pendencias);
      if (total === 0) continue;

      const chaves = (Object.keys(pendencias) as (keyof Pendencias)[])
        .filter((chave) => pendencias[chave] > 0)
        .sort((a, b) => pendencias[b] - pendencias[a]);

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const linkEmpresa = `${baseUrl}/rh/${[...dados.empresaIds][0]}`;

      const itensTexto = chaves.map((c) => `- ${ROTULOS_PENDENCIA[c]}: ${pendencias[c]}`).join("\n");
      const itensHtml = chaves.map((c) => `<li>${ROTULOS_PENDENCIA[c]}: <b>${pendencias[c]}</b></li>`).join("");

      const texto =
        `Olá, ${dados.nome}.\n\n` +
        `Você tem ${total} pendência(s) em aberto:\n${itensTexto}\n\n` +
        `Abrir o sistema: ${linkEmpresa}`;
      const html =
        `<p>Olá, ${dados.nome}.</p>` +
        `<p>Você tem <b>${total}</b> pendência(s) em aberto:</p>` +
        `<ul>${itensHtml}</ul>` +
        `<p><a href="${linkEmpresa}">Abrir o sistema</a></p>`;

      const diaChave = diaBrasilia(hoje);
      const r = await sendEmail({
        to: dados.email,
        cc: copiaDoGrupo(dados.grupoId, dados.marcaIds),
        subject: `[RH] ${total} pendência(s) aguardando você`,
        text: texto,
        html,
        origem: "COBRANCA_RH",
        empresaId: dados.empresaIds.size === 1 ? [...dados.empresaIds][0] : null,
        chave: `cobranca-rh:${userId}:${diaChave}`,
      });
      if (r.ok) {
        if (r.deduplicado) deduplicados++;
        else enviados++;
      } else {
        erros++;
      }
    } catch {
      erros++;
    }
  }

  return { avaliados, enviados, deduplicados, erros };
}
