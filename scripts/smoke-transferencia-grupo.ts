// Fumaça das transferências no grupo contra o banco de verdade (v1.214.0).
//
// A parte pura (marcação, taxa, quadro) já está em
// scripts/test-transferencias-turnover.ts. Aqui fica o que só o banco prova:
//   1. `saidasPorTransferenciaDoGrupo` acha a ficha de origem em OUTRO CNPJ do
//      mesmo grupo — e não enxerga transferência de outro grupo;
//   2. as telas que agregam (resumo da tela inicial, placar dos setores) tiram
//      a transferência da conta de ponta a ponta, consulta inclusive;
//   3. o placar dos setores usa o setor da ÉPOCA para quem tem retrato.
//
// Cria um grupo, uma marca e CNPJs próprios, e apaga tudo no fim — as funções
// testadas usam o cliente global do Prisma, então transação com rollback não
// serviria (elas não enxergariam o que a transação criou).
//
//   npx tsx scripts/smoke-transferencia-grupo.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { dataUTC, somarMesesUTC, hojeUTC } from "../lib/datas";
import { saidasPorTransferenciaDoGrupo } from "../lib/transferencia-grupo";
import { marcarTransferencias } from "../lib/transferencia";
import { resumoDaEmpresa } from "../lib/dashboard";
import { montarPlacarDosSetores } from "../lib/painel-setor";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const sufixo = `smoke-transf-${Date.now()}`;

async function criarCnpj(marcaId: string, nome: string) {
  const empresa = await prisma.empresa.create({ data: { nome: `${nome} ${sufixo}`, marcaId } });
  const [comercial, financeiro, cargo] = await Promise.all([
    prisma.setor.create({ data: { empresaId: empresa.id, nome: "Comercial" } }),
    prisma.setor.create({ data: { empresaId: empresa.id, nome: "Financeiro" } }),
    prisma.posicao.create({ data: { empresaId: empresa.id, nome: "Analista" } }),
  ]);
  return { empresa, comercial, financeiro, cargo };
}

async function main() {
  const hoje = hojeUTC();
  const haTresMeses = somarMesesUTC(hoje, -3);
  const haDoisMeses = somarMesesUTC(hoje, -2);

  const grupo = await prisma.grupo.create({ data: { nome: `Grupo ${sufixo}` } });
  const outroGrupo = await prisma.grupo.create({ data: { nome: `Outro grupo ${sufixo}` } });
  const marca = await prisma.marca.create({ data: { nome: `Marca ${sufixo}`, grupoId: grupo.id } });
  const outraMarca = await prisma.marca.create({ data: { nome: `Outra marca ${sufixo}`, grupoId: outroGrupo.id } });

  try {
    const a = await criarCnpj(marca.id, "CNPJ A");
    const b = await criarCnpj(marca.id, "CNPJ B");
    const fora = await criarCnpj(outraMarca.id, "CNPJ de outro grupo");

    // A pessoa transferida: ficha encerrada no A, ficha nova ativa no B.
    await prisma.colaborador.create({
      data: {
        empresaId: a.empresa.id, nome: "Pessoa transferida", cpf: "12345678901",
        setorId: a.comercial.id, posicaoId: a.cargo.id, ativo: false,
        dataAdmissao: dataUTC(2023, 1, 10), dataDesligamento: haTresMeses,
        motivoDesligamento: "TRANSFERENCIA_GRUPO", transferidoParaEmpresaId: b.empresa.id,
      },
    });
    const chegada = await prisma.colaborador.create({
      data: {
        empresaId: b.empresa.id, nome: "Pessoa transferida", cpf: "12345678901",
        setorId: b.comercial.id, posicaoId: b.cargo.id, ativo: true, dataAdmissao: haTresMeses,
      },
    });
    // Uma dispensa de verdade no A, que estava no Comercial quando saiu e
    // depois teve a ficha movida para o Financeiro (o retrato guarda o Comercial).
    const dispensada = await prisma.colaborador.create({
      data: {
        empresaId: a.empresa.id, nome: "Pessoa dispensada", cpf: "98765432100",
        setorId: a.financeiro.id, posicaoId: a.cargo.id, ativo: false,
        dataAdmissao: dataUTC(2024, 6, 1), dataDesligamento: haDoisMeses, motivoDesligamento: "SEM_JUSTA_CAUSA",
      },
    });
    await prisma.retratoDesligamento.create({
      data: {
        empresaId: a.empresa.id, colaboradorId: dispensada.id,
        setorId: a.comercial.id, setorNome: "Comercial", posicaoNome: "Analista",
      },
    });
    // Um ativo no A, para o quadro não ser só a pessoa transferida.
    await prisma.colaborador.create({
      data: {
        empresaId: a.empresa.id, nome: "Pessoa ativa", cpf: "11111111111",
        setorId: a.comercial.id, posicaoId: a.cargo.id, ativo: true, dataAdmissao: dataUTC(2022, 3, 1),
      },
    });
    // Transferência em OUTRO grupo, com o mesmo CPF: não pode vazar para cá.
    await prisma.colaborador.create({
      data: {
        empresaId: fora.empresa.id, nome: "Homônimo de outro grupo", cpf: "12345678901",
        setorId: fora.comercial.id, posicaoId: fora.cargo.id, ativo: false,
        dataAdmissao: dataUTC(2020, 1, 1), dataDesligamento: haTresMeses,
        motivoDesligamento: "TRANSFERENCIA_GRUPO", transferidoParaEmpresaId: b.empresa.id,
      },
    });

    console.log("1. Fichas de origem do grupo");
    const saidas = await saidasPorTransferenciaDoGrupo([b.empresa.id]);
    ok(saidas.length === 1 && saidas[0].empresaId === a.empresa.id, "acha a origem no CNPJ A pelo grupo do CNPJ B");
    ok(!saidas.some((s) => s.empresaId === fora.empresa.id), "transferência de outro grupo não entra");
    const [marcada] = marcarTransferencias([{ ...chegada, motivoDesligamento: null }], saidas);
    ok(marcada.entradaPorTransferencia, "a ficha nova no B é reconhecida como chegada por transferência");
    ok(marcada.inicioNoGrupo?.getTime() === dataUTC(2023, 1, 10).getTime(), "tempo de casa vem da admissão no A");

    console.log("2. Resumo da tela inicial (A e B juntos)");
    const resumo = await resumoDaEmpresa([a.empresa.id, b.empresa.id]);
    ok(resumo.desligamentos12m === 1, "12 meses: 1 desligamento (a dispensa), a transferência fica fora");
    ok(resumo.admissoes12m === 0, "12 meses: nenhuma admissão (a chegada não é contratação)");
    ok(resumo.ativos === 2, "2 ativos: a pessoa transferida e a ativa do A");

    console.log("3. Placar dos setores (A e B juntos)");
    const placar = await montarPlacarDosSetores({ empresaIds: [a.empresa.id, b.empresa.id] });
    const comercial = placar.linhas.find((l) => l.nome === "Comercial");
    ok(comercial !== undefined && comercial.desligamentos === 1, "a dispensa conta no Comercial (setor da época, pelo retrato)");
    ok(comercial !== undefined && comercial.admissoes === 0, "a chegada por transferência não é admissão no Comercial");
    ok(placar.escopo.desligamentos === 1, "escopo inteiro: 1 desligamento");
  } finally {
    // Ordem de dependência: fichas (o retrato cai em cascata), setores e cargos,
    // CNPJs, marcas, grupos.
    const empresas = await prisma.empresa.findMany({ where: { nome: { endsWith: sufixo } }, select: { id: true } });
    const ids = empresas.map((e) => e.id);
    await prisma.colaborador.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.setor.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.posicao.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
    await prisma.marca.deleteMany({ where: { id: { in: [marca.id, outraMarca.id] } } });
    await prisma.grupo.deleteMany({ where: { id: { in: [grupo.id, outroGrupo.id] } } });
  }

  const sobrou = await prisma.empresa.count({ where: { nome: { endsWith: sufixo } } });
  ok(sobrou === 0, "nada do teste sobrou no banco");

  await prisma.$disconnect();
  if (falhas > 0) {
    console.error(`\n${falhas} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
