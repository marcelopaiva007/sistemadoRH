// Sincroniza a base com a aba "Lista de Funcionários" da planilha do RH.
//
//   npx tsx scripts/sincronizar-lista-colaboradores.ts            (simulação)
//   npx tsx scripts/sincronizar-lista-colaboradores.ts --gravar   (aplica)
//
// Sem --gravar nada é escrito. O padrão é simular: o alvo é a base de RH de
// produção.
//
// O que faz, e por quê (decidido com o dono do sistema em 31/07/2026):
//
//  1. CORRIGE O CNPJ. A base inteira nasceu na RSM TELECOM porque os demais
//     CNPJs do grupo só foram cadastrados em 29/07/2026. A planilha é a fonte
//     de verdade de quem pertence a qual empresa.
//
//  2. RECRIA SETOR E CARGO NO DESTINO. Setor e Posicao pertencem a UMA empresa.
//     Mover alguém sem remapear deixaria a pessoa apontando para o setor da
//     empresa antiga — inconsistência silenciosa que quebra organograma,
//     escalas e todo relatório por setor. Por isso a estrutura é criada no
//     destino a partir do que a planilha declara, antes de mover.
//
//  3. CRIA QUEM FALTA, com os dados da planilha.
//
// Quem está em CNPJ fora do sistema (MOBILITY TECH, ESTÁGIO/BR SISTEMAS,
// PREST. SERV., AMÉRICA SISTEMA, sem razão social) é ignorado.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const ORIGEM = String.raw`C:\Users\User\AppData\Local\Temp\claude\C--LM-Claude\a4532e4d-b800-4386-a837-fa2b3ec6867b\scratchpad\lista.json`;

type Reg = {
  linha: number;
  nome: string;
  cpf: string;
  empresa: string;
  setor: string;
  cargo: string;
  admissao: string | null;
  status: string;
  contato: string;
};

// "BRNET Cloud LTDA" e "BRNET CLOUD" são a mesma empresa; sufixo societário
// aparece de forma inconsistente na planilha.
const norm = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(LTDA|EIRELI|ME|S\/A|SA)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Sinônimos que a normalização não alcança — confirmados com o RH em
// 31/07/2026. Sem isto a Centrysol ficaria com "Área Comercial" E "Comercial"
// convivendo, cada uma com parte das pessoas: sujeira que depois ninguém sabe
// desfazer. A chave é o nome já normalizado.
const SINONIMOS: Record<string, string> = {
  COMERCIAL: "AREA COMERCIAL", // Centrysol; na RSM cai em "Vendas", ver abaixo
};

// Por empresa, quando o mesmo termo aponta para setores de nomes diferentes.
const SINONIMOS_POR_EMPRESA: Record<string, Record<string, string>> = {
  "RSM TELECOM LTDA": { COMERCIAL: "VENDAS" },
};

// "ÁREA TÉCNICA " e "Área Técnica" são o mesmo setor. Além do normalizado,
// aplica os sinônimos acima.
const chave = (s: string, empresaNome?: string) => {
  const n = norm(s);
  const porEmpresa = empresaNome ? SINONIMOS_POR_EMPRESA[empresaNome]?.[n] : undefined;
  return porEmpresa ?? SINONIMOS[n] ?? n;
};

const titulo = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s|-)([a-zà-ú])/g, (_, p, c) => p + c.toUpperCase());

async function main() {
  const regs: Reg[] = JSON.parse(readFileSync(ORIGEM, "utf8"));
  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });

  const acharEmpresa = (bruto: string) => {
    const n = norm(bruto);
    if (!n) return undefined;
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

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`Ignorados — CNPJ fora do sistema: ${ignorados.length}`);
  const porFora = new Map<string, number>();
  for (const i of ignorados) porFora.set(i.empresa || "(sem razão social)", (porFora.get(i.empresa || "(sem razão social)") ?? 0) + 1);
  for (const [k, v] of porFora) console.log(`   ${String(v).padStart(2)}  ${k}`);

  // --- 1. Estrutura: setores e cargos que cada empresa precisa ter ----------
  const precisa = new Map<string, { setores: Map<string, string>; cargos: Map<string, string> }>();
  for (const a of alvos) {
    if (!precisa.has(a.empresaId)) precisa.set(a.empresaId, { setores: new Map(), cargos: new Map() });
    const p = precisa.get(a.empresaId)!;
    if (a.setor) p.setores.set(chave(a.setor, a.empresaNome), titulo(a.setor));
    if (a.cargo) p.cargos.set(chave(a.cargo, a.empresaNome), titulo(a.cargo));
  }

  console.log(`\n--- ESTRUTURA ---`);
  // empresaId -> (chave do setor -> id)
  const setorId = new Map<string, Map<string, string>>();
  const cargoId = new Map<string, Map<string, string>>();

  for (const [empresaId, p] of precisa) {
    const nomeEmpresa = empresas.find((e) => e.id === empresaId)!.nome;
    const jaSetores = await prisma.setor.findMany({ where: { empresaId }, select: { id: true, nome: true } });
    const jaCargos = await prisma.posicao.findMany({ where: { empresaId }, select: { id: true, nome: true } });
    const mapS = new Map(jaSetores.map((s) => [chave(s.nome, nomeEmpresa), s.id]));
    const mapC = new Map(jaCargos.map((c) => [chave(c.nome, nomeEmpresa), c.id]));

    let criouS = 0;
    for (const [k, nome] of p.setores) {
      if (mapS.has(k)) continue;
      criouS++;
      if (GRAVAR) {
        const s = await prisma.setor.create({ data: { empresaId, nome } });
        mapS.set(k, s.id);
      }
    }
    let criouC = 0;
    for (const [k, nome] of p.cargos) {
      if (mapC.has(k)) continue;
      criouC++;
      if (GRAVAR) {
        const c = await prisma.posicao.create({ data: { empresaId, nome } });
        mapC.set(k, c.id);
      }
    }
    setorId.set(empresaId, mapS);
    cargoId.set(empresaId, mapC);
    console.log(`   ${nomeEmpresa.padEnd(20)} setores +${criouS} (total ${p.setores.size})  cargos +${criouC} (total ${p.cargos.size})`);
  }

  // --- 2. Pessoas ----------------------------------------------------------
  // Compara CPF por DÍGITOS dos dois lados. A coluna guardava dois formatos —
  // uns com pontuação, outros sem — e comparar o valor bruto do banco contra
  // dígitos não achou os formatados: em 31/07/2026 isso criou 40 registros
  // duplicados para gente que já existia. Os CPFs foram normalizados no banco
  // depois disso, mas a comparação continua por dígitos para o caso de entrar
  // valor formatado de novo por outra via.
  const soDigitos = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const atuais = await prisma.colaborador.findMany({
    select: { id: true, cpf: true, nome: true, empresaId: true, dataAdmissao: true, empresa: { select: { nome: true } } },
  });
  const porCpf = new Map(atuais.filter((a) => a.cpf).map((a) => [soDigitos(a.cpf), a]));

  const novos = alvos.filter((a) => !porCpf.has(a.cpf));
  const existentes = alvos.filter((a) => porCpf.has(a.cpf));
  const mudam = existentes.filter((a) => porCpf.get(a.cpf)!.empresaId !== a.empresaId);
  const ganhamAdmissao = existentes.filter((a) => !porCpf.get(a.cpf)!.dataAdmissao && a.admissao);

  const resolver = (a: (typeof alvos)[number]) => ({
    setorId: setorId.get(a.empresaId)?.get(chave(a.setor, a.empresaNome)) ?? null,
    posicaoId: cargoId.get(a.empresaId)?.get(chave(a.cargo, a.empresaNome)) ?? null,
  });

  console.log(`\n--- ${mudam.length} MUDAM DE CNPJ ---`);
  const mv = new Map<string, number>();
  for (const m of mudam) {
    const k = `${porCpf.get(m.cpf)!.empresa.nome} -> ${m.empresaNome}`;
    mv.set(k, (mv.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...mv.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`);

  let movidos = 0;
  for (const m of mudam) {
    const { setorId: s, posicaoId: p } = resolver(m);
    if (GRAVAR) {
      if (!s || !p) {
        console.log(`   ! sem setor/cargo resolvido: ${m.nome} (${m.setor} / ${m.cargo}) — pulado`);
        continue;
      }
      const colaboradorId = porCpf.get(m.cpf)!.id;
      // O histórico acompanha. A troca de CNPJ aqui é correção de cadastro
      // errado, não transferência real: essas pessoas sempre foram da
      // BRNET/BR SISTEMAS/etc. Se o vínculo estava errado, o histórico dele
      // também estava — e a tela de férias filtra por empresa, então deixá-lo
      // para trás mostraria a pessoa numa empresa e as férias dela em outra.
      await prisma.$transaction([
        prisma.colaborador.update({
          where: { id: colaboradorId },
          data: { empresaId: m.empresaId, setorId: s, posicaoId: p },
        }),
        prisma.solicitacaoFerias.updateMany({
          where: { colaboradorId },
          data: { empresaId: m.empresaId },
        }),
        prisma.documentoColaborador.updateMany({
          where: { colaboradorId },
          data: { empresaId: m.empresaId },
        }),
      ]);
    }
    movidos++;
  }

  console.log(`\n--- ${ganhamAdmissao.length} GANHAM DATA DE ADMISSÃO ---`);
  for (const g of ganhamAdmissao) {
    console.log(`   ${g.nome.slice(0, 30).padEnd(32)} ${g.admissao}`);
    if (GRAVAR) {
      await prisma.colaborador.update({
        where: { id: porCpf.get(g.cpf)!.id },
        data: { dataAdmissao: new Date(`${g.admissao}T12:00:00Z`) },
      });
    }
  }

  console.log(`\n--- ${novos.length} A CRIAR ---`);
  let criados = 0;
  for (const n of novos) {
    const { setorId: s, posicaoId: p } = resolver(n);
    console.log(`   ${n.nome.slice(0, 28).padEnd(30)} ${n.empresaNome.padEnd(18)} ${n.setor.slice(0, 18).padEnd(20)} ${n.admissao ?? ""}`);
    if (!GRAVAR) continue;
    if (!s || !p) {
      console.log(`   ! sem setor/cargo resolvido — pulado`);
      continue;
    }
    await prisma.colaborador.create({
      data: {
        empresaId: n.empresaId,
        nome: n.nome.trim(),
        cpf: n.cpf,
        setorId: s,
        posicaoId: p,
        ativo: true,
        dataAdmissao: n.admissao ? new Date(`${n.admissao}T12:00:00Z`) : null,
      },
    });
    criados++;
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`  Mudam de CNPJ:        ${movidos}`);
  console.log(`  Ganham admissão:      ${ganhamAdmissao.length}`);
  console.log(`  Criados:              ${GRAVAR ? criados : novos.length}`);
  console.log(`  Ignorados:            ${ignorados.length}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
