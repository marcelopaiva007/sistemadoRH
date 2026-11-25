"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { proximasMatriculas } from "@/lib/matricula";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { hojeUTC } from "@/lib/datas";
import {
  validarPlanilhaColaboradores,
  type LinhaValidada,
} from "@/lib/importacao-colaboradores";
import {
  normalizarEmailColaborador,
  ehConflitoDeEmailEntrePessoas,
  empresaIdsDoGrupoDaEmpresa,
} from "@/lib/colaborador-email";
import {
  casarNoCatalogo,
  chaveDeNome,
  camposAlterados,
  movimentacaoDaImportacao,
  motivoDaMovimentacaoImportada,
  MAX_LINHAS_IMPORTACAO,
  type CasamentoCatalogo,
  type FichaAtual,
} from "@/lib/importacao-catalogo";

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
//
// Desde 26/11/2026: setor/cargo são casados no catálogo da MARCA (não mais só
// do CNPJ de destino), mudança de setor/cargo/salário de quem já existe grava
// Movimentacao, e a gravação é em lote — ver lib/importacao-catalogo.ts.

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB; o teto que manda de verdade é o de linhas

const msgLinhasDemais = (total: number) =>
  `A planilha tem ${total.toLocaleString("pt-BR")} linhas; o limite por importação é ` +
  `${MAX_LINHAS_IMPORTACAO.toLocaleString("pt-BR")}. Divida em partes e importe uma de cada vez.`;

// Tamanho dos lotes de gravação (createMany) e das consultas por e-mail.
const LOTE = 1_000;

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
  // Nome da planilha que vai apontar para um cadastro da marca com outra
  // grafia ("Comercial" → "Vendas"). A tela mostra para o RH conferir.
  setoresCasados: { planilha: string; cadastro: string }[];
  cargosCasados: { planilha: string; cadastro: string }[];
  lote: string; // JSON de LinhaValidada[] — volta no confirmar
};

export type RelatorioImportacao = {
  ok: true;
  fase: "importado";
  criados: number;
  atualizados: number;
  semMudanca: number;
  movimentacoes: number;
  setoresCriados: number;
  cargosCriados: number;
};

export type ResultadoImportacao =
  | RelatorioConferencia
  | RelatorioImportacao
  | { ok: false; error: string };

const paraIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const paraData = (iso: string | null) => {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
};

function emLotes<T>(itens: T[], tamanho = LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Carrega TUDO o que a importação precisa, em poucas consultas, antes de
 * qualquer laço: colaboradores do CNPJ (com o que a comparação e a
 * movimentação precisam) e o catálogo de setores e cargos da MARCA. Até
 * 26/11/2026 eram 2 a 3 consultas POR LINHA dentro da transação.
 *
 * Quem casa por CPF (ou, sem CPF, por matrícula) será atualizado; o resto,
 * criado. Setor e cargo são casados no catálogo da marca e só o que a marca
 * não tem é criado (no CNPJ de destino).
 */
async function planejar(empresaId: string, linhas: LinhaValidada[]) {
  const escopoMarca = await empresasDaMesmaMarca(empresaId);
  const [colaboradores, setores, posicoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId },
      select: {
        id: true,
        nome: true,
        cpf: true,
        matricula: true,
        email: true,
        telefone: true,
        dataAdmissao: true,
        dataNascimento: true,
        salarioBase: true,
        tipoContrato: true,
        setorId: true,
        posicaoId: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
      },
    }),
    prisma.setor.findMany({
      where: { empresaId: { in: escopoMarca } },
      select: { id: true, nome: true, empresaId: true, ativo: true },
    }),
    prisma.posicao.findMany({
      where: { empresaId: { in: escopoMarca } },
      select: { id: true, nome: true, empresaId: true, ativo: true },
    }),
  ]);

  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  const porCpf = new Map(colaboradores.filter((c) => c.cpf).map((c) => [c.cpf!, c.id]));
  const porMatricula = new Map(
    colaboradores.filter((c) => c.matricula).map((c) => [c.matricula!, c.id]),
  );

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

  return { plano, porId, setores, posicoes };
}

/**
 * E-mails da planilha que já pertencem a OUTRA pessoa — repetidos dentro da
 * própria planilha ou já cadastrados no grupo. Consulta o grupo em lotes (uma
 * ida ao banco por mil e-mails), nunca uma por linha. Roda na conferência e de
 * novo na confirmação: o lote viajou pelo navegador, e o banco pode ter mudado
 * entre um clique e outro.
 */
async function conflitosDeEmail(
  empresaId: string,
  linhas: LinhaValidada[],
  existenteIdPorLinha: Map<number, string | null>,
): Promise<Map<number, string[]>> {
  const problemas = new Map<number, string[]>();
  const adicionar = (linha: LinhaValidada, mensagem: string) => {
    const lista = problemas.get(linha.numeroDaLinha) ?? [];
    lista.push(mensagem);
    problemas.set(linha.numeroDaLinha, lista);
  };

  // 1. E-mails repetidos dentro da própria planilha para CPFs diferentes (ou sem CPF)
  const emailsVistosNaPlanilha = new Map<string, LinhaValidada>();
  for (const linha of linhas) {
    const emailNorm = normalizarEmailColaborador(linha.email);
    if (!emailNorm) continue;
    const anterior = emailsVistosNaPlanilha.get(emailNorm);
    if (anterior) {
      const conflito = ehConflitoDeEmailEntrePessoas(
        { id: existenteIdPorLinha.get(linha.numeroDaLinha) ?? undefined, cpf: linha.cpf },
        {
          id: existenteIdPorLinha.get(anterior.numeroDaLinha) ?? String(anterior.numeroDaLinha),
          cpf: anterior.cpf,
        },
      );
      if (conflito) {
        adicionar(
          linha,
          `E-mail repetido na planilha para CPFs distintos (mesmo da linha ${anterior.numeroDaLinha})`,
        );
      }
    } else {
      emailsVistosNaPlanilha.set(emailNorm, linha);
    }
  }

  // 2. E-mails já cadastrados em outra pessoa no grupo
  const emailsUnicos = [...emailsVistosNaPlanilha.keys()];
  if (emailsUnicos.length === 0) return problemas;

  const empresaIdsGrupo = await empresaIdsDoGrupoDaEmpresa(prisma, empresaId);
  const consultas = await Promise.all(
    emLotes(emailsUnicos).map((lote) =>
      prisma.colaborador.findMany({
        where: {
          empresaId: { in: empresaIdsGrupo },
          OR: lote.map((em) => ({ email: { equals: em, mode: "insensitive" as const } })),
        },
        select: {
          id: true,
          nome: true,
          cpf: true,
          email: true,
          ativo: true,
          empresa: { select: { nome: true, marca: { select: { nome: true } } } },
        },
      }),
    ),
  );
  const existentesNoGrupo = consultas.flat();

  const existentesPorEmail = new Map<string, typeof existentesNoGrupo>();
  for (const c of existentesNoGrupo) {
    const norm = normalizarEmailColaborador(c.email);
    if (!norm) continue;
    (existentesPorEmail.get(norm) ?? existentesPorEmail.set(norm, []).get(norm)!).push(c);
  }

  for (const linha of linhas) {
    if (problemas.has(linha.numeroDaLinha)) continue;
    const emailNorm = normalizarEmailColaborador(linha.email);
    if (!emailNorm) continue;
    const cadastrados = existentesPorEmail.get(emailNorm);
    if (!cadastrados) continue;

    const existenteId = existenteIdPorLinha.get(linha.numeroDaLinha) ?? undefined;
    for (const outro of cadastrados) {
      if (ehConflitoDeEmailEntrePessoas({ id: existenteId, cpf: linha.cpf }, outro)) {
        const marcaNome = outro.empresa?.marca?.nome ?? "Marca";
        const empresaNome = outro.empresa?.nome ?? "Empresa";
        const statusDesligado = outro.ativo ? "" : " · desligado";
        adicionar(
          linha,
          `E-mail já cadastrado para ${outro.nome} (${marcaNome} · ${empresaNome}${statusDesligado})`,
        );
        break;
      }
    }
  }
  return problemas;
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

  // O teto vale para a planilha inteira (válidas + com problema): é o que o
  // RH vê no Excel, e é o que ele vai dividir.
  const totalLinhas = resultado.validas.length + resultado.problemas.length;
  if (totalLinhas > MAX_LINHAS_IMPORTACAO) return { ok: false, error: msgLinhasDemais(totalLinhas) };

  // Cruza com o banco previamente para obter existenteId (por CPF ou matrícula)
  // permitindo que colaborador sem CPF consiga atualizar seu próprio cadastro
  // via matrícula sem acusar falso conflito consigo mesmo no e-mail.
  const { plano: planoInicial, setores, posicoes } = await planejar(empresaId, resultado.validas);
  const existenteIdPorLinha = new Map(
    planoInicial.map((p) => [p.linha.numeroDaLinha, p.existenteId]),
  );

  const errosEmail = await conflitosDeEmail(empresaId, resultado.validas, existenteIdPorLinha);
  const problemasAdicionais = resultado.validas
    .filter((l) => errosEmail.has(l.numeroDaLinha))
    .map((l) => ({ numeroDaLinha: l.numeroDaLinha, nome: l.nome, mensagens: errosEmail.get(l.numeroDaLinha)! }));

  const validasFinais = resultado.validas.filter((l) => !errosEmail.has(l.numeroDaLinha));
  const problemasFinais = [...resultado.problemas, ...problemasAdicionais].sort(
    (a, b) => a.numeroDaLinha - b.numeroDaLinha,
  );

  const plano = planoInicial.filter((p) => !errosEmail.has(p.linha.numeroDaLinha));
  const setoresCasamento = casarNoCatalogo("setor", validasFinais.map((l) => l.setor), setores, empresaId);
  const cargosCasamento = casarNoCatalogo("cargo", validasFinais.map((l) => l.cargo), posicoes, empresaId);

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
    problemas: problemasFinais,
    setoresNovos: setoresCasamento.novos,
    cargosNovos: cargosCasamento.novos,
    setoresCasados: setoresCasamento.casadosComOutroNome,
    cargosCasados: cargosCasamento.casadosComOutroNome,
    lote: JSON.stringify(validasFinais),
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
  if (linhas.length > MAX_LINHAS_IMPORTACAO) {
    return { ok: false, error: msgLinhasDemais(linhas.length) };
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

  const { plano, porId, setores, posicoes } = await planejar(empresaId, saneadas);

  // E-mail de novo, contra o banco de AGORA, em lote. Qualquer conflito
  // derruba a importação inteira (mesmo comportamento de antes): a conferência
  // já tinha tirado essas linhas, então conflito aqui é o banco que mudou.
  const errosEmail = await conflitosDeEmail(
    empresaId,
    saneadas,
    new Map(plano.map((p) => [p.linha.numeroDaLinha, p.existenteId])),
  );
  if (errosEmail.size > 0) {
    const linha = saneadas.find((l) => errosEmail.has(l.numeroDaLinha))!;
    return {
      ok: false,
      error: `Linha ${linha.numeroDaLinha} (${linha.nome}): ${errosEmail.get(linha.numeroDaLinha)![0]}. Confira a planilha de novo.`,
    };
  }

  const setoresCasamento = casarNoCatalogo("setor", saneadas.map((l) => l.setor), setores, empresaId);
  const cargosCasamento = casarNoCatalogo("cargo", saneadas.map((l) => l.cargo), posicoes, empresaId);
  const nomeSetorPorId = new Map(setores.map((s) => [s.id, s.nome]));
  const nomeCargoPorId = new Map(posicoes.map((p) => [p.id, p.nome]));

  const registradoPorNome = user.name ?? user.username ?? null;
  const dataEfetiva = hojeUTC();

  let criados = 0;
  let atualizados = 0;
  let semMudanca = 0;
  let movimentacoes = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. Setores e cargos que a MARCA ainda não tem nascem primeiro, no CNPJ
        //    de destino, numa consulta cada — as linhas depois só apontam.
        const idPorNomeNovo = async (
          casamento: CasamentoCatalogo,
          criar: (nomes: string[]) => Promise<{ id: string; nome: string }[]>,
          nomes: Map<string, string>,
        ) => {
          const mapa = new Map<string, string>();
          if (casamento.novos.length === 0) return mapa;
          for (const c of await criar(casamento.novos)) {
            mapa.set(chaveDeNome(c.nome), c.id);
            nomes.set(c.id, c.nome);
          }
          return mapa;
        };
        const setoresCriados = await idPorNomeNovo(
          setoresCasamento,
          (nomes) =>
            tx.setor.createManyAndReturn({
              data: nomes.map((nome) => ({ nome, empresaId })),
              select: { id: true, nome: true },
            }),
          nomeSetorPorId,
        );
        const cargosCriados = await idPorNomeNovo(
          cargosCasamento,
          (nomes) =>
            tx.posicao.createManyAndReturn({
              data: nomes.map((nome) => ({ nome, empresaId })),
              select: { id: true, nome: true },
            }),
          nomeCargoPorId,
        );

        const resolver = (casamento: CasamentoCatalogo, criadosAgora: Map<string, string>, nome: string) => {
          const r = casamento.resolucao.get(chaveDeNome(nome));
          if (!r) throw new Error(`Não foi possível resolver "${nome}" no catálogo.`);
          if (r.tipo === "existente") return r.id;
          const id = criadosAgora.get(chaveDeNome(r.nome));
          if (!id) throw new Error(`Não foi possível criar "${r.nome}" no catálogo.`);
          return id;
        };

        // 2. Separa criação de atualização, já com o diff calculado em memória.
        const novos = plano.filter((p) => !p.existenteId);
        const matriculas = await proximasMatriculas(
          novos.filter((p) => !p.linha.matricula).length,
          tx,
        );
        let iMatricula = 0;

        const dadosCriacao = novos.map(({ linha }) => ({
          empresaId,
          nome: linha.nome,
          setorId: resolver(setoresCasamento, setoresCriados, linha.setor),
          posicaoId: resolver(cargosCasamento, cargosCriados, linha.cargo),
          cpf: linha.cpf,
          // A planilha manda quando traz o número; sem ele, o sistema gera.
          matricula: linha.matricula || matriculas[iMatricula++],
          email: linha.email,
          telefone: linha.telefone,
          dataAdmissao: paraData(linha.dataAdmissao),
          dataNascimento: paraData(linha.dataNascimento),
          salarioBase: linha.salarioBase,
          tipoContrato: linha.tipoContrato,
          ativo: true,
        }));
        for (const lote of emLotes(dadosCriacao)) {
          const r = await tx.colaborador.createMany({ data: lote });
          criados += r.count;
        }

        // 3. Atualizações: só quem muda vira UPDATE (um por colaborador — os
        //    campos variam linha a linha). A ficha em memória acompanha cada
        //    gravação, para duas linhas do mesmo CPF compararem com o estado
        //    já atualizado, não com o do banco.
        type Ficha = FichaAtual & { setorNome: string; posicaoNome: string };
        const fichas = new Map<string, Ficha>();
        const movs: {
          empresaId: string;
          colaboradorId: string;
          tipo: string;
          dataEfetiva: Date;
          motivo: string;
          registradoPorId: string;
          registradoPorNome: string | null;
          setorAnteriorNome?: string;
          setorNovoId?: string;
          setorNovoNome?: string;
          posicaoAnteriorNome?: string;
          posicaoNovaId?: string;
          posicaoNovaNome?: string;
        }[] = [];

        for (const { linha, existenteId } of plano) {
          if (!existenteId) continue;
          let ficha = fichas.get(existenteId);
          if (!ficha) {
            const c = porId.get(existenteId)!;
            ficha = {
              nome: c.nome,
              cpf: c.cpf,
              matricula: c.matricula,
              email: c.email,
              telefone: c.telefone,
              dataAdmissao: paraIso(c.dataAdmissao),
              dataNascimento: paraIso(c.dataNascimento),
              salarioBase: c.salarioBase,
              tipoContrato: c.tipoContrato,
              setorId: c.setorId,
              posicaoId: c.posicaoId,
              setorNome: c.setor.nome,
              posicaoNome: c.posicao.nome,
            };
            fichas.set(existenteId, ficha);
          }

          const setorId = resolver(setoresCasamento, setoresCriados, linha.setor);
          const posicaoId = resolver(cargosCasamento, cargosCriados, linha.cargo);
          const mudancas = camposAlterados(ficha, {
            nome: linha.nome,
            cpf: linha.cpf,
            matricula: linha.matricula,
            email: linha.email,
            telefone: linha.telefone,
            dataAdmissao: linha.dataAdmissao,
            dataNascimento: linha.dataNascimento,
            salarioBase: linha.salarioBase,
            tipoContrato: linha.tipoContrato,
            setorId,
            posicaoId,
          });
          if (Object.keys(mudancas).length === 0) {
            semMudanca++;
            continue;
          }

          const depois: Ficha = {
            ...ficha,
            ...mudancas,
            setorNome: nomeSetorPorId.get(setorId) ?? ficha.setorNome,
            posicaoNome: nomeCargoPorId.get(posicaoId) ?? ficha.posicaoNome,
          };
          const mov = movimentacaoDaImportacao(ficha, depois);
          if (mov) {
            // Movimentacao não tem coluna de salário: o valor vai no texto do
            // motivo (mesma tela da ficha, que já mostra o salário).
            movs.push({
              empresaId,
              colaboradorId: existenteId,
              tipo: mov.tipo,
              dataEfetiva,
              motivo: motivoDaMovimentacaoImportada(arquivoNome, mov),
              registradoPorId: user.id,
              registradoPorNome,
              setorAnteriorNome: mov.setorAnteriorNome,
              setorNovoId: mov.setorNovoId,
              setorNovoNome: mov.setorNovoNome,
              posicaoAnteriorNome: mov.posicaoAnteriorNome,
              posicaoNovaId: mov.posicaoNovaId,
              posicaoNovaNome: mov.posicaoNovaNome,
            });
          }

          // Atualiza SÓ o que a planilha trouxe e mudou. Campo vazio na
          // planilha não apaga o que a ficha já tem — planilha incompleta é o
          // caso normal, não uma ordem de limpeza.
          const { dataAdmissao, dataNascimento, ...resto } = mudancas;
          await tx.colaborador.update({
            where: { id: existenteId },
            data: {
              ...resto,
              ...(dataAdmissao ? { dataAdmissao: paraData(dataAdmissao) } : {}),
              ...(dataNascimento ? { dataNascimento: paraData(dataNascimento) } : {}),
            },
          });
          fichas.set(existenteId, depois);
          atualizados++;
        }

        // 4. O histórico de quem mudou de setor/cargo/salário, numa consulta.
        for (const lote of emLotes(movs)) {
          const r = await tx.movimentacao.createMany({ data: lote });
          movimentacoes += r.count;
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
      // Com as gravações em lote o custo que sobra é um UPDATE por colaborador
      // que muda; MAX_LINHAS_IMPORTACAO foi escolhido para caber aqui com folga.
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e: unknown) {
    if (violouUnique(e)) {
      return {
        ok: false,
        error:
          "Outro cadastro com o mesmo nome (setor, cargo ou matrícula) foi gravado durante a importação. Confira a planilha de novo.",
      };
    }
    const mensagem = e instanceof Error ? e.message : "Erro ao confirmar importação.";
    return { ok: false, error: mensagem };
  }

  // O resumo diz quantos; a trilha nunca carrega CPF nem salário.
  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ImportacaoArquivo",
    resumo:
      `Planilha "${arquivoNome}": ${criados} colaborador(es) criado(s), ${atualizados} atualizado(s)` +
      (movimentacoes > 0 ? `, ${movimentacoes} movimentação(ões) registrada(s)` : ""),
  });

  revalidatePath(`/rh/${empresaId}`, "layout");
  return {
    ok: true,
    fase: "importado",
    criados,
    atualizados,
    semMudanca,
    movimentacoes,
    setoresCriados: setoresCasamento.novos.length,
    cargosCriados: cargosCasamento.novos.length,
  };
}
