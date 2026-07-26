"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import {
  validarPlanilhaColaboradores,
  type LinhaValidada,
} from "@/lib/importacao-colaboradores";

// Importação em massa de colaboradores, em duas etapas:
//
//   1. CONFERIR — o arquivo é validado por inteiro e NADA é gravado. Volta um
//      relatório linha a linha (o que será criado, atualizado, o que tem erro
//      e por quê) e o lote validado, serializado.
//   2. CONFIRMAR — recebe o lote de volta e grava. As linhas passam pela
//      validação de novo (é barata) — o lote viaja pelo navegador do usuário,
//      e o que decide o que entra no banco é sempre o servidor.
//
// Linha com erro NUNCA bloqueia as demais: o RH corrige as 12 erradas depois,
// em vez de destravar 200 certas só quando a planilha estiver perfeita.

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB ≈ dezenas de milhares de linhas; planilha maior é outro problema

export type RelatorioConferencia = {
  ok: true;
  fase: "conferencia";
  arquivoNome: string;
  colunasIgnoradas: string[];
  criar: { numeroDaLinha: number; nome: string }[];
  atualizar: { numeroDaLinha: number; nome: string; motivo: string }[];
  problemas: { numeroDaLinha: number; nome: string; mensagens: string[] }[];
  setoresNovos: string[];
  cargosNovos: string[];
  lote: string; // JSON de LinhaValidada[] — volta no confirmar
};

export type RelatorioImportacao = {
  ok: true;
  fase: "importado";
  criados: number;
  atualizados: number;
  setoresCriados: number;
  cargosCriados: number;
};

export type ResultadoImportacao =
  | RelatorioConferencia
  | RelatorioImportacao
  | { ok: false; error: string };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Cruza as linhas válidas com o que já existe na empresa: quem casa por CPF
 * (ou, sem CPF, por matrícula) será atualizado; o resto, criado. Também lista
 * os setores e cargos que a planilha menciona e a empresa ainda não tem.
 */
async function planejar(empresaId: string, linhas: LinhaValidada[]) {
  const [colaboradores, setores, posicoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId },
      select: { id: true, cpf: true, matricula: true },
    }),
    prisma.setor.findMany({ where: { empresaId }, select: { id: true, nome: true } }),
    prisma.posicao.findMany({ where: { empresaId }, select: { id: true, nome: true } }),
  ]);

  const porCpf = new Map(colaboradores.filter((c) => c.cpf).map((c) => [c.cpf!, c.id]));
  const porMatricula = new Map(
    colaboradores.filter((c) => c.matricula).map((c) => [c.matricula!, c.id]),
  );
  const setorPorNome = new Map(setores.map((s) => [normalizar(s.nome), s.id]));
  const cargoPorNome = new Map(posicoes.map((p) => [normalizar(p.nome), p.id]));

  const plano = linhas.map((linha) => {
    let existenteId: string | null = null;
    let motivo = "";
    if (linha.cpf && porCpf.has(linha.cpf)) {
      existenteId = porCpf.get(linha.cpf)!;
      motivo = "mesmo CPF";
    } else if (linha.matricula && porMatricula.has(linha.matricula)) {
      existenteId = porMatricula.get(linha.matricula)!;
      motivo = "mesma matrícula";
    }
    return { linha, existenteId, motivo };
  });

  const setoresNovos = [
    ...new Set(
      linhas.map((l) => l.setor).filter((s) => !setorPorNome.has(normalizar(s))),
    ),
  ];
  const cargosNovos = [
    ...new Set(
      linhas.map((l) => l.cargo).filter((c) => !cargoPorNome.has(normalizar(c))),
    ),
  ];

  return { plano, setorPorNome, cargoPorNome, setoresNovos, cargosNovos };
}

export async function conferirPlanilha(
  empresaId: string,
  _prev: ResultadoImportacao | null,
  fd: FormData,
): Promise<ResultadoImportacao> {
  await requireEmpresaAccess(empresaId);

  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, error: "Escolha um arquivo .csv para conferir." };
  }
  if (arquivo.size > MAX_BYTES) {
    return { ok: false, error: "Arquivo acima de 2 MB. Divida a planilha em partes menores." };
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { cnpj: true },
  });

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const resultado = validarPlanilhaColaboradores(bytes, empresa?.cnpj ?? null);
  if (resultado.erroGeral) return { ok: false, error: resultado.erroGeral };

  const { plano, setoresNovos, cargosNovos } = await planejar(empresaId, resultado.validas);

  return {
    ok: true,
    fase: "conferencia",
    arquivoNome: arquivo.name,
    colunasIgnoradas: resultado.colunasIgnoradas,
    criar: plano
      .filter((p) => !p.existenteId)
      .map((p) => ({ numeroDaLinha: p.linha.numeroDaLinha, nome: p.linha.nome })),
    atualizar: plano
      .filter((p) => p.existenteId)
      .map((p) => ({ numeroDaLinha: p.linha.numeroDaLinha, nome: p.linha.nome, motivo: p.motivo })),
    problemas: resultado.problemas,
    setoresNovos,
    cargosNovos,
    lote: JSON.stringify(resultado.validas),
  };
}

export async function confirmarImportacao(
  empresaId: string,
  _prev: ResultadoImportacao | null,
  fd: FormData,
): Promise<ResultadoImportacao> {
  const user = await requireEmpresaAccess(empresaId);

  const bruto = fd.get("lote");
  const arquivoNome = String(fd.get("arquivoNome") ?? "planilha.csv").slice(0, 200);
  if (typeof bruto !== "string" || bruto === "") {
    return { ok: false, error: "Nada para importar — confira a planilha primeiro." };
  }

  let linhas: LinhaValidada[];
  try {
    linhas = JSON.parse(bruto);
  } catch {
    return { ok: false, error: "Lote ilegível. Confira a planilha de novo." };
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { ok: false, error: "O lote está vazio — nenhuma linha válida para importar." };
  }
  if (linhas.length > 20_000) {
    return { ok: false, error: "Lote grande demais." };
  }

  // O lote fez uma viagem pelo navegador; nada nele é confiável. Cada campo
  // passa por saneamento antes de encostar no banco.
  const saneadas: LinhaValidada[] = [];
  for (const l of linhas) {
    if (typeof l?.nome !== "string" || !l.nome.trim()) {
      return { ok: false, error: "Lote adulterado (linha sem nome). Confira a planilha de novo." };
    }
    if (typeof l.setor !== "string" || !l.setor.trim() || typeof l.cargo !== "string" || !l.cargo.trim()) {
      return { ok: false, error: "Lote adulterado (linha sem setor/cargo). Confira a planilha de novo." };
    }
    saneadas.push({
      numeroDaLinha: Number(l.numeroDaLinha) || 0,
      nome: l.nome.trim().slice(0, 200),
      cpf: typeof l.cpf === "string" && /^\d{11}$/.test(l.cpf) ? l.cpf : null,
      matricula: typeof l.matricula === "string" ? l.matricula.slice(0, 50) : null,
      setor: l.setor.trim().slice(0, 120),
      cargo: l.cargo.trim().slice(0, 120),
      email: typeof l.email === "string" ? l.email.slice(0, 200) : null,
      telefone: typeof l.telefone === "string" ? l.telefone.slice(0, 40) : null,
      dataAdmissao:
        typeof l.dataAdmissao === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.dataAdmissao)
          ? l.dataAdmissao
          : null,
      dataNascimento:
        typeof l.dataNascimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.dataNascimento)
          ? l.dataNascimento
          : null,
      salarioBase:
        typeof l.salarioBase === "number" && Number.isFinite(l.salarioBase) && l.salarioBase >= 0
          ? l.salarioBase
          : null,
      tipoContrato: typeof l.tipoContrato === "string" ? l.tipoContrato.slice(0, 30) : null,
    });
  }

  const { plano, setorPorNome, cargoPorNome, setoresNovos, cargosNovos } = await planejar(
    empresaId,
    saneadas,
  );

  const paraData = (iso: string | null) => {
    if (!iso) return null;
    const [ano, mes, dia] = iso.split("-").map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia));
  };

  let criados = 0;
  let atualizados = 0;

  await prisma.$transaction(
    async (tx) => {
      // Setores e cargos que a planilha menciona e ainda não existem nascem
      // primeiro, uma vez só — as linhas depois só apontam.
      for (const nome of setoresNovos) {
        const s = await tx.setor.create({ data: { nome, empresaId } });
        setorPorNome.set(normalizar(nome), s.id);
      }
      for (const nome of cargosNovos) {
        const p = await tx.posicao.create({ data: { nome, empresaId } });
        cargoPorNome.set(normalizar(nome), p.id);
      }

      for (const { linha, existenteId } of plano) {
        const setorId = setorPorNome.get(normalizar(linha.setor))!;
        const posicaoId = cargoPorNome.get(normalizar(linha.cargo))!;

        if (existenteId) {
          // Atualiza SÓ o que a planilha trouxe. Campo vazio na planilha não
          // apaga o que a ficha já tem — planilha incompleta é o caso normal,
          // não uma ordem de limpeza.
          await tx.colaborador.update({
            where: { id: existenteId },
            data: {
              nome: linha.nome,
              setorId,
              posicaoId,
              ...(linha.cpf ? { cpf: linha.cpf } : {}),
              ...(linha.matricula ? { matricula: linha.matricula } : {}),
              ...(linha.email ? { email: linha.email } : {}),
              ...(linha.telefone ? { telefone: linha.telefone } : {}),
              ...(linha.dataAdmissao ? { dataAdmissao: paraData(linha.dataAdmissao) } : {}),
              ...(linha.dataNascimento ? { dataNascimento: paraData(linha.dataNascimento) } : {}),
              ...(linha.salarioBase !== null ? { salarioBase: linha.salarioBase } : {}),
              ...(linha.tipoContrato ? { tipoContrato: linha.tipoContrato } : {}),
            },
          });
          atualizados++;
        } else {
          await tx.colaborador.create({
            data: {
              empresaId,
              nome: linha.nome,
              setorId,
              posicaoId,
              cpf: linha.cpf,
              matricula: linha.matricula,
              email: linha.email,
              telefone: linha.telefone,
              dataAdmissao: paraData(linha.dataAdmissao),
              dataNascimento: paraData(linha.dataNascimento),
              salarioBase: linha.salarioBase,
              tipoContrato: linha.tipoContrato,
              ativo: true,
            },
          });
          criados++;
        }
      }

      await tx.importacaoArquivo.create({
        data: {
          empresaId,
          arquivoNome,
          tipo: "COLABORADORES",
          totalLinhas: saneadas.length,
          criados,
          atualizados,
          comErro: 0, // linha com erro nunca chega ao lote — fica no relatório
          criadoPorId: user.id,
          criadoPorNome: user.username,
        },
      });
    },
    // 400 linhas em transação única passam do timeout padrão (5s) do client.
    { timeout: 60_000 },
  );

  // O resumo diz quantos; a trilha nunca carrega CPF nem salário.
  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ImportacaoArquivo",
    resumo: `Planilha "${arquivoNome}": ${criados} colaborador(es) criado(s), ${atualizados} atualizado(s)`,
  });

  revalidatePath(`/rh/${empresaId}`, "layout");
  return {
    ok: true,
    fase: "importado",
    criados,
    atualizados,
    setoresCriados: setoresNovos.length,
    cargosCriados: cargosNovos.length,
  };
}
