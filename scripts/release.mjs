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

const diff = execSync("git diff --name-only").toString().trim().split("\n").filter(Boolean);
if (diff.length === 0) {
  console.error("Nada pra commitar (working tree limpo).");
  process.exit(1);
}

run("git add package.json");
run(`git commit -m "chore: bump version ${pkg.version.replace(proximo, "")} → ${proximo}"`);
run("git push origin master");
console.log(`\nDeploy disparado em ${proximo}.`);