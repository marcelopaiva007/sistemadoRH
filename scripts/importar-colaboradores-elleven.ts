// Importa os colaboradores da LM Telecom para o módulo de RH (tabela Colaborador).
//
// Fontes:
//  1) usuarios-sistema.csv/json — "Listagem - Usuários do Sistema" exportada do
//     elleven pelo RH (roster OFICIAL: 208 usuários ativos, com e-mail, CPF,
//     perfil de acesso e equipes). Define QUEM entra e o setor/posição.
//  2) colaboradores.json — extração do relatório "Pessoas Completo - Analítico"
//     (Colaborador = Sim) do elleven. ENRIQUECE com telefone, cidade, data de
//     nascimento e Cod Pessoa (ellevenCodigo), casando por CPF (fallback: nome).
//
// Setor: derivado das equipes do usuário, agrupadas por área (ex.: "Área
// Técnica | Suporte ao Cliente" -> "Área Técnica"); quando o usuário está em
// várias áreas, vale a mais frequente (empate: primeira listada).
// Posição: "Perfil de Acesso" (sem o sufixo "[Default]").
//
// Upsert idempotente por CPF -> ellevenCodigo -> nome normalizado.
// Uso: npx tsx scripts/importar-colaboradores-elleven.ts [--dry]
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

const DRY = process.argv.includes("--dry");
const DISCOVERY_DIR = "C:/LM Claude/scripts/elleven-discovery";
const EMPRESA_NOME = "LM Telecom";
const SETOR_PADRAO = "Não definido";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e"]);
function tokensNome(nome: string): string[] {
  return normalizar(nome)
    .split(" ")
    .filter((t) => t && !PARTICULAS.has(t));
}
function tokensContidosEmOrdem(menor: string[], maior: string[]): boolean {
  if (menor.length < 2) return false;
  let i = 0;
  for (const t of maior) {
    if (t === menor[i]) i++;
    if (i === menor.length) return true;
  }
  return false;
}
function mesmoNomeFuzzy(a: string, b: string): boolean {
  const ta = tokensNome(a);
  const tb = tokensNome(b);
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return tokensContidosEmOrdem(menor, maior);
}

function parseDataBr(raw: string): Date | null {
  const m = (raw || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) || Number(m[3]) < 1900 ? null : d;
}

// Mapeia uma equipe do elleven para o setor (área) do RH.
function areaDaEquipe(equipe: string): string {
  const e = equipe.trim();
  const prefixos: Array<[RegExp, string]> = [
    [/^área técnica/i, "Área Técnica"],
    [/^área administrativa/i, "Área Administrativa"],
    [/^área comercial/i, "Área Comercial"],
    [/^área financeira|^financeiro/i, "Área Financeira"],
    [/^infraestrutura/i, "Infraestrutura de Redes"],
    [/^t\.i\b/i, "T.I"],
    [/^pós vendas/i, "Pós Vendas"],
    [/^jurídico/i, "Jurídico"],
    [/^diretoria/i, "Diretoria"],
    [/^cobranças/i, "Área Financeira"],
    [/^administração/i, "Área Administrativa"],
    [/^atd telefônico/i, "Área Administrativa"],
    [/^suporte$|^tecnico$|^fibra$|^rádio$/i, "Área Técnica"],
  ];
  for (const [rx, area] of prefixos) if (rx.test(e)) return area;
  return e; // ex.: "Equipe de Atendimento - VAPT" vira setor próprio
}

function setorDoUsuario(equipesRaw: string): string {
  const equipes = (equipesRaw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (equipes.length === 0) return SETOR_PADRAO;
  const contagem = new Map<string, number>();
  for (const eq of equipes) {
    const area = areaDaEquipe(eq);
    contagem.set(area, (contagem.get(area) ?? 0) + 1);
  }
  let melhor = areaDaEquipe(equipes[0]);
  let melhorN = 0;
  for (const eq of equipes) {
    const area = areaDaEquipe(eq);
    const n = contagem.get(area)!;
    if (n > melhorN) {
      melhor = area;
      melhorN = n;
    }
  }
  return melhor;
}

async function main() {
  const usuarios: Record<string, string>[] = JSON.parse(
    fs.readFileSync(path.join(DISCOVERY_DIR, "usuarios-sistema.json"), "utf8"),
  );
  const pessoasElleven: Record<string, string>[] = JSON.parse(
    fs.readFileSync(path.join(DISCOVERY_DIR, "colaboradores.json"), "utf8"),
  );

  // Índices de enriquecimento (extração do elleven): por CPF e por nome.
  type Extra = {
    codigo: string;
    telefone: string | null;
    cidade: string | null;
    nascimento: Date | null;
    nome: string;
  };
  const porCpf = new Map<string, Extra>();
  const todasExtras: Extra[] = [];
  for (const r of pessoasElleven) {
    if (r["Tipo de Pessoa"] !== "Pessoa Física") continue;
    const extra: Extra = {
      codigo: r["Cod Pessoa"],
      telefone: (r["Telefone Celular Padrao"] || r["Telefone Padrao"] || "").trim() || null,
      cidade: (r["Cidade"] || "").trim() || null,
      nascimento: parseDataBr(r["Data Nascimento"] || ""),
      nome: (r["Razao Social"] || "").trim(),
    };
    todasExtras.push(extra);
    const cpf = (r["Documento"] || "").replace(/\D/g, "");
    if (cpf.length === 11) {
      const atual = porCpf.get(cpf);
      // preferimos o registro com mais dados preenchidos
      if (!atual || (!atual.telefone && extra.telefone)) porCpf.set(cpf, extra);
    }
  }

  // Monta os colaboradores finais a partir do roster de usuários.
  type Final = {
    nome: string;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    cidade: string | null;
    dataNascimento: Date | null;
    ellevenCodigo: string | null;
    setorNome: string;
    posicaoNome: string;
    enriquecido: "cpf" | "nome" | "nao";
  };
  const finais: Final[] = [];
  const vistosCpf = new Set<string>();
  let duplicados = 0;
  for (const u of usuarios) {
    const nome = (u["Nome"] || "").trim();
    if (!nome) continue;
    const cpf = (u["Documento"] || "").replace(/\D/g, "");
    const cpfOk = cpf.length === 11 ? cpf : null;
    if (cpfOk) {
      if (vistosCpf.has(cpfOk)) {
        duplicados++;
        continue;
      }
      vistosCpf.add(cpfOk);
    }
    let extra: Extra | undefined;
    let enriquecido: Final["enriquecido"] = "nao";
    if (cpfOk && porCpf.has(cpfOk)) {
      extra = porCpf.get(cpfOk);
      enriquecido = "cpf";
    } else {
      extra = todasExtras.find((e) => mesmoNomeFuzzy(e.nome, nome));
      if (extra) enriquecido = "nome";
    }
    const email = (u["E-mail"] || "").trim().toLowerCase();
    finais.push({
      nome,
      cpf: cpfOk,
      email: email.includes("@") ? email : null,
      telefone: extra?.telefone ?? null,
      cidade: extra?.cidade ?? null,
      dataNascimento: extra?.nascimento ?? null,
      ellevenCodigo: extra?.codigo ?? null,
      setorNome: setorDoUsuario(u["Equipe"] || ""),
      posicaoNome: (u["Perfil de Acesso"] || "").replace(/\s*\[Default\]\s*/i, "").trim() || "Não definido",
      enriquecido,
    });
  }

  const porSetor = new Map<string, number>();
  finais.forEach((f) => porSetor.set(f.setorNome, (porSetor.get(f.setorNome) ?? 0) + 1));
  const porPosicao = new Map<string, number>();
  finais.forEach((f) => porPosicao.set(f.posicaoNome, (porPosicao.get(f.posicaoNome) ?? 0) + 1));

  console.log(`Usuários no roster: ${usuarios.length} | importáveis: ${finais.length} | duplicados por CPF: ${duplicados}`);
  console.log(`Enriquecidos com dados do elleven: por CPF ${finais.filter((f) => f.enriquecido === "cpf").length}, por nome ${finais.filter((f) => f.enriquecido === "nome").length}, sem match ${finais.filter((f) => f.enriquecido === "nao").length}`);
  console.log(`Com telefone: ${finais.filter((f) => f.telefone).length} | com e-mail: ${finais.filter((f) => f.email).length} | com CPF: ${finais.filter((f) => f.cpf).length}`);
  console.log("Setores:", JSON.stringify([...porSetor.entries()].sort((a, b) => b[1] - a[1])));
  console.log("Posições:", JSON.stringify([...porPosicao.entries()].sort((a, b) => b[1] - a[1])));

  const preview = finais.map((f) => ({
    nome: f.nome,
    cpf: f.cpf,
    telefone: f.telefone,
    email: f.email,
    setor: f.setorNome,
    posicao: f.posicaoNome,
    cidade: f.cidade,
    enriquecido: f.enriquecido,
  }));
  fs.writeFileSync(path.join(DISCOVERY_DIR, "importacao-preview.json"), JSON.stringify(preview, null, 2));
  console.log(`Preview salvo em ${DISCOVERY_DIR}/importacao-preview.json`);

  if (DRY) {
    console.log("(dry-run: nada gravado)");
    process.exit(0);
  }

  const { prisma } = await import("@/lib/prisma");
  const empresa = await prisma.empresa.findUnique({ where: { nome: EMPRESA_NOME } });
  if (!empresa) throw new Error(`Empresa "${EMPRESA_NOME}" não encontrada`);

  const setorIds = new Map<string, string>();
  for (const nome of new Set(finais.map((f) => f.setorNome))) {
    const s = await prisma.setor.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome } },
      update: { ativo: true },
      create: { empresaId: empresa.id, nome },
    });
    setorIds.set(nome, s.id);
  }
  const posicaoIds = new Map<string, string>();
  for (const nome of new Set(finais.map((f) => f.posicaoNome))) {
    const p = await prisma.posicao.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome } },
      update: { ativo: true },
      create: { empresaId: empresa.id, nome },
    });
    posicaoIds.set(nome, p.id);
  }

  const existentes = await prisma.colaborador.findMany({
    where: { empresaId: empresa.id },
    select: { id: true, nome: true, cpf: true, ellevenCodigo: true },
  });

  let criados = 0;
  let atualizados = 0;
  for (const f of finais) {
    const match =
      (f.cpf ? existentes.find((e) => e.cpf === f.cpf) : undefined) ??
      (f.ellevenCodigo ? existentes.find((e) => e.ellevenCodigo === f.ellevenCodigo) : undefined) ??
      existentes.find((e) => normalizar(e.nome) === normalizar(f.nome));

    const dados = {
      nome: f.nome,
      cpf: f.cpf,
      email: f.email,
      telefone: f.telefone,
      cidade: f.cidade,
      dataNascimento: f.dataNascimento,
      ellevenCodigo: f.ellevenCodigo,
      setorId: setorIds.get(f.setorNome)!,
      posicaoId: posicaoIds.get(f.posicaoNome)!,
      ativo: true,
    };
    if (match) {
      await prisma.colaborador.update({ where: { id: match.id }, data: dados });
      atualizados++;
    } else {
      await prisma.colaborador.create({ data: { ...dados, empresaId: empresa.id } });
      criados++;
    }
  }

  console.log(`Gravado: ${criados} criado(s), ${atualizados} atualizado(s).`);
  const totalDb = await prisma.colaborador.count({ where: { empresaId: empresa.id } });
  const ativosDb = await prisma.colaborador.count({ where: { empresaId: empresa.id, ativo: true } });
  console.log(`No banco agora: ${totalDb} colaborador(es) da ${EMPRESA_NOME}, ${ativosDb} ativo(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
