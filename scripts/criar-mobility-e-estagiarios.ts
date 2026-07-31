// Cadastra a marca Mobility Tech e os estagiários da BR SISTEMAS.
//
//   npx tsx scripts/criar-mobility-e-estagiarios.ts            (simulação)
//   npx tsx scripts/criar-mobility-e-estagiarios.ts --gravar   (aplica)
//
// Sobra da sincronização de 31/07/2026: 15 pessoas ficaram de fora por estarem
// em razão social que não existia no sistema. Definido com o RH:
//
//  - MOBILITY TECH (4 pessoas): marca nova, com um CNPJ de mesmo nome. O número
//    do CNPJ não veio na planilha e o campo é opcional — fica para depois.
//  - ESTÁGIO/BR SISTEMAS (2): mesmo CNPJ da BR SISTEMAS. O cargo vira
//    "Estagiário" em vez do "Atendente" da planilha: é o que distingue do
//    efetivo no cadastro, já que o modelo não tem campo de tipo de vínculo.
//  - AMÉRICA SISTEMA (1), PREST. SERV. (1) e 7 sem razão social: ficam de fora
//    até se definir a qual CNPJ pertencem.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\a4532e4d-b800-4386-a837-fa2b3ec6867b\scratchpad\lista.json`;

type Reg = {
  nome: string;
  cpf: string;
  empresa: string;
  setor: string;
  cargo: string;
  admissao: string | null;
};

const titulo = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s|-)([a-zà-ú])/g, (_, p, c) => p + c.toUpperCase());

const dig = (s: string | null) => (s ?? "").replace(/\D/g, "");

// Reaproveita setor/cargo já existentes na empresa em vez de duplicar por
// diferença de caixa ou acento.
const chave = (s: string) =>
  s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();

async function estruturaDe(empresaId: string) {
  const [setores, cargos] = await Promise.all([
    prisma.setor.findMany({ where: { empresaId }, select: { id: true, nome: true } }),
    prisma.posicao.findMany({ where: { empresaId }, select: { id: true, nome: true } }),
  ]);
  return {
    setores: new Map(setores.map((s) => [chave(s.nome), s.id])),
    cargos: new Map(cargos.map((c) => [chave(c.nome), c.id])),
  };
}

async function garantir(
  empresaId: string,
  est: { setores: Map<string, string>; cargos: Map<string, string> },
  setor: string,
  cargo: string,
) {
  let sId = est.setores.get(chave(setor));
  if (!sId) {
    console.log(`     + setor "${titulo(setor)}"`);
    if (GRAVAR) {
      const s = await prisma.setor.create({ data: { empresaId, nome: titulo(setor) } });
      sId = s.id;
      est.setores.set(chave(setor), s.id);
    }
  }
  let cId = est.cargos.get(chave(cargo));
  if (!cId) {
    console.log(`     + cargo "${titulo(cargo)}"`);
    if (GRAVAR) {
      const c = await prisma.posicao.create({ data: { empresaId, nome: titulo(cargo) } });
      cId = c.id;
      est.cargos.set(chave(cargo), c.id);
    }
  }
  return { setorId: sId, posicaoId: cId };
}

async function criarPessoas(
  empresaId: string,
  pessoas: (Reg & { cargoFinal: string })[],
  rotulo: string,
) {
  console.log(`\n--- ${rotulo}: ${pessoas.length} pessoa(s) ---`);
  const est = await estruturaDe(empresaId);
  const existentes = await prisma.colaborador.findMany({
    where: { empresaId },
    select: { cpf: true },
  });
  const jaTem = new Set(existentes.map((e) => dig(e.cpf)));

  for (const p of pessoas) {
    if (jaTem.has(p.cpf)) {
      console.log(`   = ${p.nome.slice(0, 30)} — já cadastrado, pulado`);
      continue;
    }
    console.log(`   ${p.nome.slice(0, 30).padEnd(32)} ${p.setor.slice(0, 22).padEnd(24)} ${p.cargoFinal}`);
    const { setorId, posicaoId } = await garantir(empresaId, est, p.setor, p.cargoFinal);
    if (!GRAVAR) continue;
    await prisma.colaborador.create({
      data: {
        empresaId,
        nome: p.nome.trim(),
        cpf: p.cpf,
        setorId: setorId!,
        posicaoId: posicaoId!,
        ativo: true,
        dataAdmissao: p.admissao ? new Date(`${p.admissao}T12:00:00Z`) : null,
      },
    });
  }
}

async function main() {
  const regs: Reg[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}`);

  // --- Mobility Tech: marca + CNPJ ------------------------------------------
  const daMobility = regs.filter((r) => /MOBILITY/i.test(r.empresa));
  let marca = await prisma.marca.findFirst({ where: { nome: "Mobility Tech" } });
  if (!marca) {
    console.log(`\n+ marca "Mobility Tech"`);
    if (GRAVAR) marca = await prisma.marca.create({ data: { nome: "Mobility Tech" } });
  }
  let empresaMob = await prisma.empresa.findFirst({ where: { nome: "Mobility Tech" } });
  if (!empresaMob) {
    console.log(`+ empresa "Mobility Tech" na marca Mobility Tech`);
    // cnpj fica nulo: o número não veio na planilha e o campo é opcional.
    if (GRAVAR) {
      empresaMob = await prisma.empresa.create({
        data: { nome: "Mobility Tech", marcaId: marca!.id, razaoSocial: "MOBILITY TECH LTDA" },
      });
    }
  }
  if (GRAVAR && empresaMob) {
    await criarPessoas(
      empresaMob.id,
      daMobility.map((p) => ({ ...p, cargoFinal: p.cargo })),
      "Mobility Tech",
    );
  } else if (!GRAVAR) {
    console.log(`\n--- Mobility Tech: ${daMobility.length} pessoa(s) ---`);
    for (const p of daMobility)
      console.log(`   ${p.nome.slice(0, 30).padEnd(32)} ${p.setor.slice(0, 22).padEnd(24)} ${p.cargo}`);
  }

  // --- Estagiários da BR SISTEMAS -------------------------------------------
  const estagiarios = regs.filter((r) => /EST[ÁA]GIO/i.test(r.empresa));
  const br = await prisma.empresa.findFirst({ where: { nome: "BR SISTEMAS LTDA" } });
  if (!br) throw new Error("BR SISTEMAS LTDA não encontrada.");
  await criarPessoas(
    br.id,
    // Cargo "Estagiário" no lugar do "Atendente" da planilha: é o que
    // distingue do efetivo, já que não há campo de tipo de vínculo.
    estagiarios.map((p) => ({ ...p, cargoFinal: "ESTAGIÁRIO" })),
    "Estagiários — BR SISTEMAS LTDA",
  );

  const foraDeVez = regs.filter(
    (r) => /AM[ÉE]RICA|PREST/i.test(r.empresa) || !r.empresa.trim(),
  );
  console.log(`\nDeixados de fora, como combinado: ${foraDeVez.length}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
