#!/usr/bin/env node
/**
 * Bumpar versão + commit + push — dispara deploy na Vercel.
 *
 * Sem bump explícito o topbar mostra "v1.11.0 · <commit>" até alguém lembrar
 * de mexer no package.json. Este script faz isso em um comando, seguindo
 * semver: sem argumentos sobe patch (1.11.0 → 1.11.1), `minor` sobe minor,
 * `major` sobe major.
 *
 * Uso:
 *   npm run release                # patch (default)
 *   npm run release -- minor
 *   npm run release -- major
 *
 * Mensagem de commit inclui a versão nova — quando a Vercel logar o deploy
 * já dá pra casar commit ↔ versão sem abrir o GitHub.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgPath = resolve("package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
const nivel = (process.argv[2] ?? "patch").toLowerCase();

let proximo;
if (nivel === "major") proximo = `${maj + 1}.0.0`;
else if (nivel === "minor") proximo = `${maj}.${min + 1}.0`;
else if (nivel === "patch") proximo = `${maj}.${min}.${pat + 1}`;
else {
  console.error(`Nível inválido: ${nivel} (use major | minor | patch)`);
  process.exit(1);
}

pkg.version = proximo;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// 1. Checagem de TypeScript antes de soltar release
console.log("🔍 Validando compilação de TypeScript...");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
} catch {
  console.error("❌ Falha na compilação do TypeScript. Release abortada.");
  process.exit(1);
}

// 2. Trava anti-vazamento de imports de banco em componentes de cliente ("use client")
console.log("🛡️ Verificando segurança de bundling dos componentes de cliente...");
const arquivos = execSync('grep -rnw "use client" app/ components/ | cut -d: -f1 | sort -u', { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter(Boolean);

let violacoes = 0;
for (const arquivo of arquivos) {
  const conteudo = readFileSync(arquivo, "utf8");
  // Só considera componente de cliente se "use client" estiver nas primeiras linhas (diretiva do React)
  const primeiraLinha = conteudo.split("\n").slice(0, 5).join("\n");
  if (/['"]use client['"]/.test(primeiraLinha)) {
    if (/import.*from.*(@\/lib\/prisma|lib\/prisma|pg|@prisma\/adapter-pg)/.test(conteudo)) {
      console.error(`❌ ERRO: Componente de cliente ("use client") importando banco de dados: ${arquivo}`);
      violacoes++;
    }
  }
}

if (violacoes > 0) {
  console.error(`\n❌ Encontradas ${violacoes} violação(ões) de bundling. Release cancelada.`);
  process.exit(1);
}

run("git add -A");
run(`git commit -m "chore: bump version ${pkg.version.replace(proximo, "")} → ${proximo}"`);
run("git push origin master");
console.log(`\nDeploy disparado em ${proximo}.`);