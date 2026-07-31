// Importa a aba "Funcionários Demitidos 2025" da planilha de colaboradores.
//
//   npx tsx scripts/importar-demitidos-2025.ts            (simulação)
//   npx tsx scripts/importar-demitidos-2025.ts --gravar   (aplica)
//
// Mesma estrutura e as mesmas decisões de scripts/importar-demitidos-2026.ts —
// quem está em CNPJ não cadastrado é ignorado, quem já está cadastrado só
// recebe a baixa na empresa onde já está, e readmitido não é desligado.
//
// Duas diferenças, ambas ditadas pelos dados de 2025:
//
// 1. O casamento é por CPF ANTES de olhar a empresa. Em 2025 a planilha traz
//    "RSM CONSULTORIA EM TECNOLOGIA LTDA", que não é uma das empresas
//    cadastradas; filtrar por CNPJ primeiro (como em 2026) descartaria a linha
//    inteira e essa gente ficaria sem baixa mesmo estando no sistema sob outro
//    CNPJ. A empresa só decide onde CRIAR quem ainda não existe.
// 2. CPF é comparado só pelos dígitos. Uma linha vem com "713.880.074.60" —
//    ponto no lugar do hífen — e a comparação literal não acharia ninguém.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ANO = "2025";

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

const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\83fecaa2-4b5c-44ce-998b-c19e19d33617\scratchpad\demitidos-2025.json`;

type Reg = { linha: number; nome: string; cpf: string; empresa: string; demissao: string | null };

const digitos = (s: string) => (s || "").replace(/\D/g, "");

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

async function main() {
  const todos: Reg[] = JSON.parse(readFileSync(ORIGEM, "utf8"));

  // A aba de 2025 carrega uma linha cuja demissão já é de 2026 — ela pertence à
  // aba do ano seguinte, que tem inclusive outra data para a mesma pessoa.
  // Importar por aqui gravaria a data errada.
  const foraDoAno = todos.filter((r) => !r.demissao?.startsWith(ANO));
  const regs = todos.filter((r) => r.demissao?.startsWith(ANO));

  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const acharEmpresa = (bruto: string) => {
    const n = norm(bruto);
    return (
      empresas.find((e) => norm(e.nome) === n) ??
      empresas.find((e) => norm(e.nome).startsWith(n) || n.startsWith(norm(e.nome)))
    );
  };

  // Casa por CPF primeiro: quem já existe recebe a baixa onde está, não importa
  // o CNPJ que a planilha aponta.
  const cadastrados = await prisma.colaborador.findMany({
    where: { cpf: { not: null } },
    select: { id: true, cpf: true, nome: true, ativo: true, dataAdmissao: true, dataDesligamento: true },
  });
  const porCpf = new Map(cadastrados.map((c) => [digitos(c.cpf!), c]));

  const baixas: Reg[] = [];
  const novos: (Reg & { empresaId: string; empresaNome: string })[] = [];
  const ignorados: Reg[] = [];
  for (const r of regs) {
    if (porCpf.has(digitos(r.cpf))) {
      baixas.push(r);
      continue;
    }
    const e = acharEmpresa(r.empresa);
    if (!e) ignorados.push(r);
    else novos.push({ ...r, empresaId: e.id, empresaNome: e.nome });
  }

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Linhas na aba: ${todos.length} | de ${ANO}: ${regs.length}`);

  console.log(`\nFora de ${ANO} (não importados): ${foraDoAno.length}`);
  for (const f of foraDoAno) console.log(`   L${f.linha} ${f.nome} — demissão ${f.demissao}`);

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
    console.log(`   ${n.nome.slice(0, 30).padEnd(32)} ${n.empresaNome.padEnd(18)} ${n.demissao}`);
    if (!GRAVAR) continue;
    const est = estrutura.get(n.empresaId)!;
    await prisma.colaborador.create({
      data: {
        empresaId: n.empresaId,
        nome: n.nome.trim(),
        cpf: n.cpf || null,
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
    const atual = porCpf.get(digitos(b.cpf))!;
    const readmitido = foiReadmitido(atual, b.demissao);
    const precisa = !readmitido && !atual.dataDesligamento;
    const admissao = atual.dataAdmissao?.toISOString().slice(0, 10);
    const situacao = readmitido
      ? `  <- READMITIDO (${admissao ? `admissao ${admissao}` : "ativo hoje"}), desligamento historico descartado`
      : precisa
        ? ""
        : "  (nada a fazer)";
    console.log(
      `   ${atual.nome.slice(0, 30).padEnd(32)} ${atual.ativo ? "ATIVO" : "inativo"}` +
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
  console.log(`  Criar:              ${novos.length}`);
  console.log(`  Atualizar:          ${alterados}`);
  console.log(`  Readmitidos (preservados): ${preservados}`);
  console.log(`  Sem alteração:      ${baixas.length - alterados - preservados}`);
  console.log(`  Ignorados:          ${ignorados.length}`);
  console.log(`  Fora de ${ANO}:        ${foraDoAno.length}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
