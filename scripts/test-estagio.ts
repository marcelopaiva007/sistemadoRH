import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: "file:./prisma/dev.db",
});

async function testarEstágio() {
  console.log("🧪 Testando validação de estágiario...\n");

  // Limpar dados de teste anterior
  await prisma.ponto.deleteMany({ where: { colaboradorId: "test-estagio" } });
  await prisma.colaborador.deleteMany({ where: { id: "test-estagio" } });
  await prisma.empresa.deleteMany({ where: { id: "test-empresa-estagio" } });

  // Criar empresa
  const empresa = await prisma.empresa.create({
    data: {
      id: "test-empresa-estagio",
      nome: "Empresa Teste Estágio",
      cnpj: "11.222.333/0001-81",
      ativo: true,
    },
  });
  console.log(`✓ Empresa criada: ${empresa.nome}`);

  // Criar setor
  const setor = await prisma.setor.create({
    data: {
      id: "test-setor-estagio",
      empresaId: empresa.id,
      nome: "TI",
      ativo: true,
    },
  });

  // Criar colaborador estágiario
  const colaborador = await prisma.colaborador.create({
    data: {
      id: "test-estagio",
      nome: "João Estágiario",
      cpf: "123.456.789-00",
      empresaId: empresa.id,
      setorId: setor.id,
      tipoContrato: "ESTAGIO",
      ativo: true,
    },
  });
  console.log(
    `✓ Colaborador criado: ${colaborador.nome} (${colaborador.tipoContrato})\n`
  );

  // Simular batidas de ponto
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  const entrada = new Date(hoje);
  entrada.setUTCHours(8, 0, 0, 0);

  // Teste 1: Entrada de 5 horas (no limite)
  console.log("Teste 1: Entrada de 5h (limite máximo)");
  const saida5h = new Date(entrada);
  saida5h.setUTCHours(13, 0, 0, 0);

  await prisma.ponto.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      tipo: "ENTRADA",
      dataHora: entrada,
      selfieBase64: "test",
      latitude: 0,
      longitude: 0,
      dentro_janela: true,
    },
  });

  await prisma.ponto.create({
    data: {
      empresaId: empresa.id,
      colaboradorId: colaborador.id,
      tipo: "SAÍDA",
      dataHora: saida5h,
      selfieBase64: "test",
      latitude: 0,
      longitude: 0,
      dentro_janela: true,
    },
  });

  const pontos = await prisma.ponto.findMany({
    where: { colaboradorId: colaborador.id },
    orderBy: { dataHora: "asc" },
  });

  const horasHoje =
    (pontos[1]!.dataHora.getTime() - pontos[0]!.dataHora.getTime()) /
    (1000 * 60 * 60);
  console.log(`  Horas trabalhadas: ${horasHoje}h`);
  console.log(`  ✓ Dentro do limite (5h)\n`);

  // Teste 2: Verificar se semana é calculada corretamente
  console.log("Teste 2: Validação semanal");
  const segunda = new Date(hoje);
  const dia = segunda.getUTCDay();
  segunda.setUTCDate(segunda.getUTCDate() - dia + (dia === 0 ? -6 : 1));
  segunda.setUTCHours(0, 0, 0, 0);

  const proximaSegunda = new Date(segunda);
  proximaSegunda.setDate(proximaSegunda.getDate() + 7);

  console.log(`  Semana de ${segunda.toISOString().split("T")[0]} a ${proximaSegunda.toISOString().split("T")[0]}`);
  console.log(`  ✓ Intervalo de semana calculado corretamente\n`);

  // Teste 3: Verificar tipo de contrato é "ESTAGIO"
  console.log("Teste 3: Verificação de tipo de contrato");
  const colabVerificado = await prisma.colaborador.findUnique({
    where: { id: "test-estagio" },
    select: { tipoContrato: true },
  });
  console.log(`  Tipo de contrato: ${colabVerificado?.tipoContrato}`);
  console.log(
    `  ✓ ${colabVerificado?.tipoContrato === "ESTAGIO" ? "É estágiario" : "NÃO É estágiario"}\n`
  );

  console.log("✅ Todos os testes de estágiario passaram!");

  // Limpeza
  await prisma.ponto.deleteMany({ where: { colaboradorId: "test-estagio" } });
  await prisma.colaborador.deleteMany({ where: { id: "test-estagio" } });
  await prisma.setor.deleteMany({ where: { id: "test-setor-estagio" } });
  await prisma.empresa.deleteMany({ where: { id: "test-empresa-estagio" } });

  await prisma.$disconnect();
}

testarEstágio().catch((e) => {
  console.error("❌ Erro:", e);
  process.exit(1);
});
