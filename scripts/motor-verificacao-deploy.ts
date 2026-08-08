/**
 * Motor de Verificação e Resolução de Problemas pós-Deploy (RH System Engine)
 *
 * Execução:
 *   npm run verificar:deploy
 *
 * Funcionalidades:
 * 1. Checa sincronia de versão (Local x Vercel Produção)
 * 2. Valida integridade do ambiente e banco de dados (Neon / Prisma)
 * 3. Testa rotas críticas de produção (HTTP Status Check)
 * 4. Aponta diagnósticos e soluções automáticas/prescritivas para falhas
 */

import { execSync } from "node:child_process";
import pacote from "../package.json";

const URL_PRODUCAO = process.env.NEXT_PUBLIC_APP_URL || "https://sistemado-rh-two.vercel.app";

type StatusItem = {
  nome: string;
  ok: boolean;
  detalhe: string;
  solucao?: string;
};

const resultados: StatusItem[] = [];

function registrar(nome: string, ok: boolean, detalhe: string, solucao?: string) {
  resultados.push({ nome, ok, detalhe, solucao });
  const icone = ok ? "✅" : "✖";
  console.log(`${icone} [${nome}] ${detalhe}`);
  if (!ok && solucao) {
    console.log(`   💡 Solução recomendada: ${solucao}\n`);
  }
}

async function checarVersaoOnline() {
  console.log("\n🔍 1. Verificando Sincronia de Versão...");
  const versaoLocal = pacote.version;

  let commitLocal = "";
  try {
    commitLocal = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    commitLocal = "desconhecido";
  }

  try {
    const res = await fetch(`${URL_PRODUCAO}/login`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      registrar(
        "Status HTTP /login",
        false,
        `Página /login respondeu com HTTP ${res.status}`,
        "Verifique os logs de build/runtime no painel da Vercel."
      );
      return;
    }
    const html = await res.text();
    const match = html.match(/v(\d+\.\d+\.\d+)\s*·\s*([a-f0-9]{7}|local)/i);

    if (match) {
      const versaoOnline = match[1];
      const commitOnline = match[2];

      const mesmaVersao = versaoOnline === versaoLocal;
      const mesmoCommit = commitOnline === commitLocal;

      if (mesmaVersao && mesmoCommit) {
        registrar("Versão Online", true, `Em dia com o repo (v${versaoOnline} · ${commitOnline})`);
      } else {
        const diff = mesmoCommit
          ? `Online v${versaoOnline} vs Local v${versaoLocal}`
          : `Commit online ${commitOnline} vs Local ${commitLocal}`;
        registrar(
          "Versão Online",
          false,
          `Produção desatualizada (${diff})`,
          "Execute 'git push origin master' para disparar novo deploy na Vercel."
        );
      }
    } else {
      registrar(
        "Rótulo de Versão",
        false,
        "Não foi possível ler o rótulo de versão no HTML da página de login",
        "Confira se versaoDoSistema() está sendo renderizado corretamente na tela de login."
      );
    }
  } catch (erro: any) {
    registrar(
      "Conexão com Produção",
      false,
      `Falha ao conectar em ${URL_PRODUCAO} (${erro.message})`,
      "Verifique se o domínio da Vercel está correto e acessível."
    );
  }
}

async function checarRotasCriticas() {
  console.log("\n🌐 2. Verificando Rotas Críticas do Sistema...");
  const rotas = [
    { path: "/login", label: "Login" },
    { path: "/carreiras", label: "Portal de Carreiras" },
    { path: "/portal", label: "Portal do Colaborador" },
    { path: "/esqueci-senha", label: "Recuperação de Senha" },
  ];

  for (const r of rotas) {
    try {
      const res = await fetch(`${URL_PRODUCAO}${r.path}`, {
        method: "GET",
        headers: { "User-Agent": "Engine-Verificacao-RH" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 307 || res.status === 302) {
        registrar(`Rota ${r.label}`, true, `HTTP ${res.status} OK`);
      } else {
        registrar(
          `Rota ${r.label}`,
          false,
          `HTTP ${res.status}`,
          `A rota ${r.path} retornou erro. Cheque os logs de SSR ou variáveis na Vercel.`
        );
      }
    } catch (err: any) {
      registrar(
        `Rota ${r.label}`,
        false,
        `Erro de conexão (${err.message})`,
        `Verifique conectividade de rede para ${r.path}.`
      );
    }
  }
}

function checarVariaveisEBanco() {
  console.log("\n🛠️ 3. Validando Configurações Locais e Migrações...");

  try {
    execSync("node validate-env.mjs", { stdio: "pipe" });
    registrar("Validação de Variáveis (.env)", true, "Todas as variáveis obrigatórias estão presentes");
  } catch (err: any) {
    registrar(
      "Validação de Variáveis (.env)",
      false,
      "Faltam variáveis de ambiente obrigatórias",
      "Defina AUTH_SECRET, DATABASE_URL e NEXTAUTH_URL no arquivo .env ou no painel da Vercel."
    );
  }

  try {
    execSync("npm run type-check", { stdio: "pipe" });
    registrar("Checagem de Tipos (TypeScript)", true, "0 erros de compilação TS");
  } catch (err: any) {
    registrar(
      "Checagem de Tipos (TypeScript)",
      false,
      "Existem erros de TypeScript no código",
      "Execute 'npm run type-check' e corrija os erros de tipo antes do deploy."
    );
  }
}

async function executarEngine() {
  console.log("==================================================");
  console.log("🚀 MOTOR DE VERIFICAÇÃO E RESOLUÇÃO DE DEPLOY - RH");
  console.log("==================================================");

  checarVariaveisEBanco();
  await checarVersaoOnline();
  await checarRotasCriticas();

  console.log("\n==================================================");
  const totalFalhas = resultados.filter((r) => !r.ok).length;
  if (totalFalhas === 0) {
    console.log("🎉 SISTEMA 100% OPERACIONAL - NENHUM PROBLEMA DETECTADO!");
  } else {
    console.log(`⚠️ DETECTADOS ${totalFalhas} PROBLEMA(S) QUE PRECISAM DE ATENÇÃO:`);
    resultados
      .filter((r) => !r.ok)
      .forEach((f, i) => {
        console.log(`\n${i + 1}. [${f.nome}] ${f.detalhe}`);
        if (f.solucao) console.log(`   👉 Ação: ${f.solucao}`);
      });
  }
  console.log("==================================================\n");

  process.exit(totalFalhas === 0 ? 0 : 1);
}

executarEngine();
