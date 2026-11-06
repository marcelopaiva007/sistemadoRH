import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

// REGRAS DAS MARCAS — área de admin (pedido do CEO, 05/11/2026): "botar as
// regras para eu poder selecionar: esta empresa só é vista sozinha; esta pode
// se juntar com estas outras".
//
// A regra É o grupo de sociedade (lib/grupo.ts): marcas do mesmo grupo podem
// ser vistas juntas (cada conta liga uma, várias ou todas); uma marca sozinha
// no grupo é "só ela" — quem trabalha nela não vê outra. Mudar a regra de uma
// marca é, então, mudar a marca de grupo — com o cuidado que faltava ao "Mover"
// cru de Grupos (lib/actions/grupos.ts, `moverMarcaDeGrupo`), que só desativa
// os vínculos e deixa para depois saber quem devia ir junto:
//
// - quem VAI JUNTO com a marca (o admin escolhe na tela) muda de grupo
//   mantendo o acesso a ela — e só a ela: os vínculos com as outras marcas do
//   grupo antigo saem, e Diretoria/Administrativo que chega num grupo com mais
//   marcas entra RESTRITA a esta (nada de ganhar as outras em silêncio);
// - quem FICA no grupo antigo perde a marca (vínculos com ela desativados);
// - vínculo velho com a marca, de conta de qualquer outro grupo, também é
//   desativado: sem isso ele voltaria a valer quando a marca chegasse ao grupo
//   da conta;
// - acesso de portal (colaborador sem login) segue a ficha: se a ficha é de um
//   CNPJ da marca, ele muda junto;
// - "juntar" a única marca de um grupo leva TODAS as contas dele (sem marca, o
//   grupo não teria o que mostrar) e encerra o grupo que ficou vazio.
//
// Quem pode chamar (só o MASTER) fica na action (lib/actions/regras-marcas.ts).
// Aqui é só a regra, fora do arquivo "use server" — lá, toda função exportada
// vira endpoint chamável do navegador.

export type DestinoDaRegra = { tipo: "SO_ELA" } | { tipo: "JUNTO"; grupoId: string };

export type ResultadoRegra =
  | { ok: true; resumo: string; grupoDestinoId: string | null }
  | { ok: false; error: string };

const DIRECAO = ["ADMIN", "DIRETORIA"];

/** Nome livre para o grupo novo de uma marca "só ela". */
async function nomeLivre(base: string): Promise<{ nome: string; reaproveitar: string | null }> {
  // Grupo com o nome da marca já existindo, inativo e vazio (sobra de uma
  // junção anterior): volta a ser usado, em vez de virar "Marca (2)".
  const existente = await prisma.grupo.findUnique({
    where: { nome: base },
    select: { id: true, ativo: true, _count: { select: { marcas: true, usuarios: true } } },
  });
  if (!existente) return { nome: base, reaproveitar: null };
  if (!existente.ativo && existente._count.marcas === 0 && existente._count.usuarios === 0) {
    return { nome: base, reaproveitar: existente.id };
  }
  for (let n = 2; n < 50; n++) {
    const nome = `${base} (${n})`;
    if (!(await prisma.grupo.findUnique({ where: { nome }, select: { id: true } }))) {
      return { nome, reaproveitar: null };
    }
  }
  return { nome: `${base} (${Date.now()})`, reaproveitar: null };
}

export async function aplicarRegraDaMarca(entrada: {
  marcaId: string;
  destino: DestinoDaRegra;
  /** Contas do grupo atual da marca que vão junto com ela. */
  contasQueVaoJunto: string[];
}): Promise<ResultadoRegra> {
  const marca = await prisma.marca.findUnique({
    where: { id: entrada.marcaId },
    select: {
      id: true,
      nome: true,
      ativo: true,
      grupoId: true,
      grupo: { select: { id: true, nome: true } },
    },
  });
  if (!marca || !marca.ativo) return { ok: false, error: "Marca não encontrada." };
  const origem = marca.grupo;

  const outrasDaOrigem = await prisma.marca.count({
    where: { grupoId: origem.id, ativo: true, NOT: { id: marca.id } },
  });

  // ── Para onde a marca vai ────────────────────────────────────────────────
  let destino: { id: string; nome: string } | null = null;
  let grupoNovo: { nome: string; reaproveitar: string | null } | null = null;
  if (entrada.destino.tipo === "SO_ELA") {
    if (outrasDaOrigem === 0) {
      return {
        ok: true,
        resumo: `${marca.nome} já é vista sozinha (é a única marca do cliente "${origem.nome}").`,
        grupoDestinoId: origem.id,
      };
    }
    grupoNovo = await nomeLivre(marca.nome);
  } else {
    const grupoId = entrada.destino.grupoId;
    if (grupoId === origem.id) {
      return { ok: true, resumo: `${marca.nome} já está nesse cliente.`, grupoDestinoId: origem.id };
    }
    const alvo = await prisma.grupo.findUnique({
      where: { id: grupoId },
      select: { id: true, nome: true, ativo: true, _count: { select: { marcas: { where: { ativo: true } } } } },
    });
    if (!alvo || !alvo.ativo) return { ok: false, error: "Cliente não encontrado." };
    if (alvo._count.marcas === 0) {
      return { ok: false, error: `"${alvo.nome}" não tem marca ativa para ${marca.nome} se juntar.` };
    }
    destino = { id: alvo.id, nome: alvo.nome };
  }

  // ── Quem vai junto ───────────────────────────────────────────────────────
  // A marca era a única do grupo: sem ela o grupo não mostra nada, então
  // todas as contas dele vão junto (e o grupo é encerrado).
  const esvaziaOrigem = outrasDaOrigem === 0;
  const contasDaOrigem = await prisma.user.findMany({
    where: { grupoId: origem.id, role: { notIn: ["MASTER", PAPEL_PORTAL] } },
    select: { id: true, nome: true, role: true, ativo: true, empresaId: true },
  });
  const pedidas = new Set(entrada.contasQueVaoJunto);
  const vaoJunto = esvaziaOrigem ? contasDaOrigem : contasDaOrigem.filter((u) => pedidas.has(u.id));
  // Pedido com conta que não é do grupo da marca: a tela está desatualizada.
  const desconhecidas = [...pedidas].filter((id) => !contasDaOrigem.some((u) => u.id === id));
  if (!esvaziaOrigem && desconhecidas.length > 0) {
    return { ok: false, error: "A lista de contas mudou. Recarregue a página e tente de novo." };
  }
  const idsQueVao = vaoJunto.map((u) => u.id);

  // Mesma trava de Grupos e Usuários: o grupo que continua existindo não fica
  // sem ADMIN ativo por causa desta mudança.
  if (!esvaziaOrigem) {
    const adminsAntes = contasDaOrigem.filter((u) => u.role === "ADMIN" && u.ativo);
    const adminsDepois = adminsAntes.filter((u) => !idsQueVao.includes(u.id));
    if (adminsAntes.length > 0 && adminsDepois.length === 0) {
      const nomes = adminsAntes.map((u) => u.nome).join(", ");
      return {
        ok: false,
        error: `"${origem.nome}" ficaria sem ADMIN ativo (${nomes} ${adminsAntes.length === 1 ? "é o único" : "são os únicos"}). Deixe pelo menos um no cliente.`,
      };
    }
  }

  // O destino já tem outras marcas? Então a direção que chega entra restrita
  // a esta marca, para não ganhar as outras sem ninguém decidir.
  const destinoTemOutrasMarcas = destino !== null;

  const empresasDaMarca = (
    await prisma.empresa.findMany({ where: { marcaId: marca.id }, select: { id: true } })
  ).map((e) => e.id);

  let grupoDestinoId = destino?.id ?? null;
  await prisma.$transaction(async (tx) => {
    if (grupoNovo) {
      if (grupoNovo.reaproveitar) {
        await tx.grupo.update({ where: { id: grupoNovo.reaproveitar }, data: { ativo: true } });
        grupoDestinoId = grupoNovo.reaproveitar;
      } else {
        const criado = await tx.grupo.create({ data: { nome: grupoNovo.nome }, select: { id: true } });
        grupoDestinoId = criado.id;
      }
    }
    const para = grupoDestinoId as string;

    await tx.marca.update({ where: { id: marca.id }, data: { grupoId: para } });

    // Vínculos com a marca de quem NÃO vai junto — inclusive vínculo velho de
    // conta de outro grupo, que voltaria a valer no grupo novo.
    await tx.userMarca.updateMany({
      where: { marcaId: marca.id, ativo: true, userId: { notIn: idsQueVao } },
      data: { ativo: false },
    });
    await tx.userEmpresa.updateMany({
      where: { empresaId: { in: empresasDaMarca }, ativo: true, userId: { notIn: idsQueVao } },
      data: { ativo: false, papelPrincipal: false },
    });

    if (idsQueVao.length > 0) {
      // Quem vai junto leva só a marca: os vínculos com as outras marcas do
      // grupo antigo não valem no novo.
      await tx.userMarca.updateMany({
        where: { userId: { in: idsQueVao }, ativo: true, NOT: { marcaId: marca.id } },
        data: { ativo: false },
      });
      await tx.userEmpresa.updateMany({
        where: { userId: { in: idsQueVao }, ativo: true, empresaId: { notIn: empresasDaMarca } },
        data: { ativo: false, papelPrincipal: false },
      });
      for (const u of vaoJunto) {
        const empresaFica = u.empresaId !== null && empresasDaMarca.includes(u.empresaId);
        await tx.user.update({
          where: { id: u.id },
          data: {
            grupoId: para,
            ...(empresaFica ? {} : { empresaId: null, setorId: null }),
          },
        });
        if (destinoTemOutrasMarcas && DIRECAO.includes(u.role)) {
          await tx.userMarca.upsert({
            where: { userId_marcaId: { userId: u.id, marcaId: marca.id } },
            create: { userId: u.id, marcaId: marca.id, role: u.role },
            update: { ativo: true, role: u.role },
          });
        }
      }
    }

    // Acesso de portal segue a ficha: ficha num CNPJ da marca muda junto.
    await tx.user.updateMany({
      where: {
        role: PAPEL_PORTAL,
        grupoId: origem.id,
        colaborador: { is: { empresaId: { in: empresasDaMarca } } },
      },
      data: { grupoId: para },
    });

    // Grupo que ficou sem marca nenhuma (nem desativada) e sem conta: encerrado.
    if (esvaziaOrigem) {
      const [marcasRestantes, contasRestantes] = await Promise.all([
        tx.marca.count({ where: { grupoId: origem.id } }),
        tx.user.count({ where: { grupoId: origem.id } }),
      ]);
      if (marcasRestantes === 0 && contasRestantes === 0) {
        await tx.grupo.update({ where: { id: origem.id }, data: { ativo: false } });
      }
    }
  });

  const quem =
    vaoJunto.length === 0
      ? "nenhuma conta foi junto"
      : `${vaoJunto.length} ${vaoJunto.length === 1 ? "conta foi junto" : "contas foram junto"} (${vaoJunto
          .map((u) => u.nome)
          .join(", ")})`;
  const regra =
    entrada.destino.tipo === "SO_ELA"
      ? `virou cliente próprio, de marca única ("${grupoNovo?.nome}")`
      : `passou para o cliente "${destino?.nome}"`;
  return {
    ok: true,
    resumo: `${marca.nome} ${regra}, saindo de "${origem.nome}"; ${quem}.${
      esvaziaOrigem ? ` O cliente "${origem.nome}" ficou sem marca e foi encerrado.` : ""
    }`,
    grupoDestinoId,
  };
}
