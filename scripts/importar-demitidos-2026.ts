// Importa a aba "Funcionários Demitidos 2026" da planilha de colaboradores.
//
//   npx tsx scripts/importar-demitidos-2026.ts            (simulação)
//   npx tsx scripts/importar-demitidos-2026.ts --gravar   (aplica)
//
// Sem --gravar nada é escrito: imprime exatamente o que faria. O padrão é a
// simulação de propósito — o alvo é a base de RH de produção.
//
// Decisões tomadas com o dono do sistema em 31/07/2026:
//
// - Quem está em CNPJ não cadastrado (EVO LA TAM, XSA, XSA SPORTS) é ignorado.
// - Colaborador exige setor e posição, e a aba não traz nenhum dos dois. Onde a
//   empresa não tem estrutura, criamos "Não definido" — são pessoas já
//   desligadas, o que importa é o histórico existir.
// - Quem já está cadastrado apenas recebe a baixa, na empresa onde já está.
//   Quinze deles estão sob RSM TELECOM enquanto a planilha aponta outro CNPJ
//   (os demais CNPJs só nasceram em 29/07/2026): mudar o vínculo de gente
//   desligada reescreveria histórico.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");

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
//     com admissão antiga: em 31/07/2026 um dos dois casos tinha voltado sem
//     que ninguém atualizasse a data, e ele ainda exibia a admissão de 2022.
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
const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\a4532e4d-b800-4386-a837-fa2b3ec6867b\scratchpad\demitidos.json`;

type Reg = { linha: number; nome: string; cpf: string; empresa: string; demissao: string | null };

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
  const regs: Reg[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });

  const acharEmpresa = (bruto: string) => {
    const n = norm(bruto);
    return (
      empresas.find((e) => norm(e.nome) === n) ??
      empresas.find((e) => norm(e.nome).startsWith(n) || n.startsWith(norm(e.nome)))
    );
  };

  const ignorados: Reg[] = [];
  const alvos: (Reg & { empresaId: string; empresaNome: string })[] = [];
  for (const r of regs) {
    const e = acharEmpresa(r.empresa);
    if (!e) ignorados.push(r);
    else alvos.push({ ...r, empresaId: e.id, empresaNome: e.nome });
  }

  const existentes = await prisma.colaborador.findMany({
    where: { cpf: { in: alvos.map((a) => a.cpf).filter(Boolean) } },
    select: { id: true, cpf: true, nome: true, ativo: true, dataAdmissao: true, dataDesligamento: true },
  });
  const porCpf = new Map(existentes.map((e) => [e.cpf!, e]));

  const novos = alvos.filter((a) => !porCpf.has(a.cpf));
  const baixas = alvos.filter((a) => porCpf.has(a.cpf));

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Ignorados por CNPJ ausente: ${ignorados.length}`);
  for (const i of ignorados) console.log(`   L${i.linha} ${i.nome} — ${i.empresa}`);

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
    const atual = porCpf.get(b.cpf)!;
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
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
