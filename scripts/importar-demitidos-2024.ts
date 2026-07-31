// Importa a aba "Funcionários Demitidos 2024" da planilha de colaboradores.
//
//   npx tsx scripts/importar-demitidos-2024.ts            (simulação)
//   npx tsx scripts/importar-demitidos-2024.ts --gravar   (aplica)
//
// Mesmas decisões de scripts/importar-demitidos-2025.ts: CNPJ não cadastrado é
// ignorado, quem já existe recebe a baixa onde está, readmitido não é desligado.
//
// O QUE MUDA EM 2024 — a aba quase não tem CPF.
//
// São 39 linhas de 44 sem CPF nenhum. CPF é a chave que os outros anos usam para
// saber se a pessoa já está no sistema; sem ela, todo mundo pareceria novo e o
// script criaria um segundo registro para quem já está cadastrado. Daí duas
// defesas que os scripts de 2025/2026 não precisaram ter:
//
//  1. Fallback por NOME normalizado quando não há CPF. Nome não é chave — se
//     casar com mais de um colaborador, a linha é marcada AMBÍGUA e não encosta
//     no banco. Preferir um dos dois seria escolher no escuro.
//  2. Dedupe dentro da própria aba. Três pessoas aparecem duas vezes, em
//     empresas diferentes (transferência registrada como duas saídas). Sem CPF
//     elas virariam dois cadastros. Fica a demissão mais recente, que é a saída
//     de fato; a outra sai só no relatório.
//
// Quem entra sem CPF entra sem chave: uma importação futura não vai reconhecê-lo
// e pode duplicar. O certo é a planilha ganhar os CPFs — isto aqui é o histórico
// possível com o que ela traz hoje.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ANO = "2024";

// REGRA DE READMISSÃO — o motivo de existir.
//
// Importação retroativa vê uma demissão e quer desligar a pessoa. Só que gente
// sai e volta: quem foi readmitido depois daquela data está trabalhando hoje, e
// desligá-la some das listas, corta convite e corta pesquisa de alguém que está
// no posto. Por isso a saída é sempre comparada com a entrada.
//
// Duas formas de detectar, porque o cadastro nem sempre acompanha:
//
//  1. dataAdmissao posterior à demissão da planilha — readmissão registrada.
//  2. colaborador ATIVO no sistema — na prática, está trabalhando. Vale mesmo
//     com admissão antiga: em 31/07/2026 um dos casos tinha voltado sem que
//     ninguém atualizasse a data, e ele ainda exibia a admissão de 2022.
//
// O modelo não guarda histórico de vínculos: há um dataAdmissao e um
// dataDesligamento, só. Para quem voltou, gravar o desligamento antigo
// apagaria o vínculo atual — então o desligamento histórico é descartado, e
// fica registrado no relatório em vez de no banco.
function foiReadmitido(
  atual: { ativo: boolean; dataAdmissao: Date | null },
  demissaoPlanilha: string | null,
): boolean {
  if (atual.ativo) return true;
  if (!atual.dataAdmissao || !demissaoPlanilha) return false;
  return atual.dataAdmissao.toISOString().slice(0, 10) > demissaoPlanilha;
}

const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\83fecaa2-4b5c-44ce-998b-c19e19d33617\scratchpad\demitidos-2024.json`;

type Reg = { linha: number; nome: string; cpf: string; empresa: string; demissao: string | null };

const digitos = (s: string) => (s || "").replace(/\D/g, "");

// Nome só serve de chave depois de tirar acento, caixa e pontuação — a planilha
// escreve "João Batista" e o cadastro "JOAO BATISTA".
const nomeChave = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "BRNET Cloud LTDA" e "BRNET CLOUD" são a mesma empresa. Tira acento, caixa,
// pontuação e os sufixos societários, que aparecem de forma inconsistente.
const norm = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(LTDA|EIRELI|ME|S\/A|SA)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// A planilha chama de "RSM CONSULTORIA ..." o que no cadastro é RSM TELECOM
// LTDA — mesma empresa, nome antigo. Confirmado por Marcelo em 31/07/2026.
// Casa por prefixo porque a planilha varia o sufixo ("EM TECNOLOGIA LTDA",
// "ESTAGIO", nada).
const APELIDOS: [string, string][] = [["RSM CONSULTORIA", "RSM TELECOM LTDA"]];
const aplicarApelido = (bruto: string) => {
  const n = norm(bruto);
  return APELIDOS.find(([de]) => n.startsWith(de))?.[1] ?? bruto;
};

async function main() {
  const todosRegs: Reg[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  const foraDoAno = todosRegs.filter((r) => !r.demissao?.startsWith(ANO));
  const doAno = todosRegs.filter((r) => r.demissao?.startsWith(ANO));

  // Dedupe da aba: sem CPF, a mesma pessoa em duas linhas viraria dois cadastros.
  const porPessoa = new Map<string, Reg>();
  const repetidas: { mantida: Reg; descartada: Reg }[] = [];
  for (const r of doAno) {
    const chave = digitos(r.cpf) || nomeChave(r.nome);
    const anterior = porPessoa.get(chave);
    if (!anterior) {
      porPessoa.set(chave, r);
      continue;
    }
    const [mantida, descartada] =
      (r.demissao ?? "") > (anterior.demissao ?? "") ? [r, anterior] : [anterior, r];
    porPessoa.set(chave, mantida);
    repetidas.push({ mantida, descartada });
  }
  const regs = [...porPessoa.values()];

  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const acharEmpresa = (original: string) => {
    const n = norm(aplicarApelido(original));
    return (
      empresas.find((e) => norm(e.nome) === n) ??
      empresas.find((e) => norm(e.nome).startsWith(n) || n.startsWith(norm(e.nome)))
    );
  };

  const cadastrados = await prisma.colaborador.findMany({
    select: { id: true, nome: true, cpf: true, ativo: true, dataAdmissao: true, dataDesligamento: true },
  });
  const porCpf = new Map(cadastrados.filter((c) => c.cpf).map((c) => [digitos(c.cpf!), c]));
  const porNome = new Map<string, typeof cadastrados>();
  for (const c of cadastrados) {
    const k = nomeChave(c.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), c]);
  }

  type Atual = (typeof cadastrados)[number];
  const baixas: (Reg & { atual: Atual; via: "CPF" | "nome" })[] = [];
  const ambiguos: (Reg & { quantos: number })[] = [];
  const novos: (Reg & { empresaId: string; empresaNome: string })[] = [];
  const ignorados: Reg[] = [];

  for (const r of regs) {
    const porDoc = r.cpf ? porCpf.get(digitos(r.cpf)) : undefined;
    if (porDoc) {
      baixas.push({ ...r, atual: porDoc, via: "CPF" });
      continue;
    }
    const candidatos = porNome.get(nomeChave(r.nome));
    if (candidatos && candidatos.length > 1) {
      ambiguos.push({ ...r, quantos: candidatos.length });
      continue;
    }
    if (candidatos?.length === 1) {
      baixas.push({ ...r, atual: candidatos[0], via: "nome" });
      continue;
    }
    const e = acharEmpresa(r.empresa);
    if (!e) ignorados.push(r);
    else novos.push({ ...r, empresaId: e.id, empresaNome: e.nome });
  }

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Linhas na aba: ${todosRegs.length} | de ${ANO}: ${doAno.length} | pessoas distintas: ${regs.length}`);
  console.log(`Sem CPF na planilha: ${doAno.filter((r) => !digitos(r.cpf)).length}`);

  if (foraDoAno.length) {
    console.log(`\nFora de ${ANO} (não importados): ${foraDoAno.length}`);
    for (const f of foraDoAno) console.log(`   L${f.linha} ${f.nome} — demissão ${f.demissao}`);
  }

  console.log(`\nLinhas repetidas na aba (fica a demissão mais recente): ${repetidas.length}`);
  for (const p of repetidas)
    console.log(
      `   ${p.mantida.nome.slice(0, 30).padEnd(32)} fica L${p.mantida.linha} ${p.mantida.demissao} (${p.mantida.empresa})` +
        ` / sai L${p.descartada.linha} ${p.descartada.demissao} (${p.descartada.empresa})`,
    );

  console.log(`\nNome ambíguo — não tocados: ${ambiguos.length}`);
  for (const a of ambiguos) console.log(`   L${a.linha} ${a.nome} — ${a.quantos} colaboradores com esse nome`);

  console.log(`\nIgnorados por CNPJ não cadastrado: ${ignorados.length}`);
  for (const i of ignorados) console.log(`   L${i.linha} ${i.nome.slice(0, 34).padEnd(36)} ${i.empresa}`);

  // Estrutura mínima por empresa, criada só onde falta.
  const estrutura = new Map<string, { setorId: string; posicaoId: string }>();
  for (const empresaId of new Set(novos.map((n) => n.empresaId))) {
    let setor = await prisma.setor.findFirst({ where: { empresaId, ativo: true } });
    let posicao = await prisma.posicao.findFirst({ where: { empresaId, ativo: true } });
    const nomeEmpresa = empresas.find((e) => e.id === empresaId)!.nome;

    if (!setor) {
      console.log(`\n[${nomeEmpresa}] sem setor — criando "Não definido"`);
      if (GRAVAR) setor = await prisma.setor.create({ data: { empresaId, nome: "Não definido" } });
    }
    if (!posicao) {
      console.log(`[${nomeEmpresa}] sem cargo — criando "Não definido"`);
      // Posicao pertence à empresa, não ao setor — não há setorId aqui.
      if (GRAVAR) posicao = await prisma.posicao.create({ data: { empresaId, nome: "Não definido" } });
    }
    if (GRAVAR) estrutura.set(empresaId, { setorId: setor!.id, posicaoId: posicao!.id });
  }

  console.log(`\n--- ${novos.length} a CRIAR (já desligados) ---`);
  for (const n of novos) {
    const semCpf = digitos(n.cpf) ? "" : "   (sem CPF)";
    console.log(`   ${n.nome.slice(0, 30).padEnd(32)} ${n.empresaNome.padEnd(18)} ${n.demissao}${semCpf}`);
    if (!GRAVAR) continue;
    const est = estrutura.get(n.empresaId)!;
    await prisma.colaborador.create({
      data: {
        empresaId: n.empresaId,
        nome: n.nome.trim(),
        cpf: digitos(n.cpf) ? n.cpf : null,
        setorId: est.setorId,
        posicaoId: est.posicaoId,
        ativo: false,
        dataDesligamento: n.demissao ? new Date(`${n.demissao}T12:00:00Z`) : null,
      },
    });
  }

  console.log(`\n--- ${baixas.length} JÁ CADASTRADOS: registrar desligamento ---`);
  let alterados = 0;
  let preservados = 0;
  for (const b of baixas) {
    const atual = b.atual;
    const readmitido = foiReadmitido(atual, b.demissao);
    const precisa = !readmitido && !atual.dataDesligamento;
    const admissao = atual.dataAdmissao?.toISOString().slice(0, 10);
    const situacao = readmitido
      ? `  <- READMITIDO (${admissao ? `admissao ${admissao}` : "ativo hoje"}), desligamento historico descartado`
      : precisa
        ? ""
        : "  (nada a fazer)";
    console.log(
      `   ${atual.nome.slice(0, 30).padEnd(32)} [${b.via}] ${atual.ativo ? "ATIVO" : "inativo"}` +
        ` desligamento=${atual.dataDesligamento?.toISOString().slice(0, 10) ?? "(vazio)"}` +
        ` -> ${b.demissao}${situacao}`,
    );
    if (readmitido) preservados++;
    if (!precisa) continue;
    alterados++;
    if (GRAVAR) {
      await prisma.colaborador.update({
        where: { id: atual.id },
        data: {
          ativo: false,
          dataDesligamento: b.demissao ? new Date(`${b.demissao}T12:00:00Z`) : atual.dataDesligamento,
        },
      });
    }
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`  Criar:              ${novos.length}  (sem CPF: ${novos.filter((n) => !digitos(n.cpf)).length})`);
  console.log(`  Atualizar:          ${alterados}`);
  console.log(`  Readmitidos (preservados): ${preservados}`);
  console.log(`  Sem alteração:      ${baixas.length - alterados - preservados}`);
  console.log(`  Ambíguos:           ${ambiguos.length}`);
  console.log(`  Ignorados:          ${ignorados.length}`);
  console.log(`  Linhas repetidas:   ${repetidas.length}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
