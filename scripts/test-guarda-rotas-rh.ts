/**
 * Prova, sem banco, a regra de 25/11/2026: rota de API e action do RH que
 * operam dado da empresa decidem acesso com `podeOperarEmpresaRH` (a mesma
 * pergunta das telas de /rh/<empresa>), e não com `usuarioAlcancaEmpresa`
 * sozinho — que deixa passar o GESTOR_SETOR com vínculo no CNPJ e não confere
 * o módulo "rh" do perfil.
 *
 * Duas partes:
 *  1. `podeOperarEmpresaRH` barra o GESTOR_SETOR ANTES de qualquer consulta —
 *     então roda aqui sem DATABASE_URL.
 *  2. Varredura do código: nenhuma rota em app/api/rh/** nem action em
 *     lib/actions/rh-*.ts / app/actions/rh-*.ts CHAMA `usuarioAlcancaEmpresa`,
 *     fora das exceções listadas abaixo com o motivo. Rota nova que copiar o
 *     molde antigo quebra este teste.
 *
 * Rodar: npx tsx scripts/test-guarda-rotas-rh.ts
 */
import fs from "node:fs";
import path from "node:path";
import { podeOperarEmpresaRH } from "@/lib/rh-auth-guard";

let falhas = 0;
function confere(ok: boolean, msg: string) {
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) falhas++;
}

// Exceções conscientes — cada uma com o porquê. Caminhos com "/".
const EXCECOES: Record<string, string> = {
  // Frente de pesquisas cuida destas em paralelo (25/11/2026); ficam de fora
  // deste conserto para não conflitar. Pendência registrada no relatório.
  // Segredos/lembretes: frente própria em paralelo.
  "lib/actions/rh-segredos.ts": "frente de segredos/lembretes",
};

function arquivos(dir: string, filtro: (f: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const saida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...arquivos(p, filtro));
    else if (filtro(p)) saida.push(p);
  }
  return saida;
}

async function main() {
  // 1. Gestor de setor nunca opera a empresa pelo RH — nem com vínculo ativo.
  const gestor = {
    id: "u-gestor",
    role: "GESTOR_SETOR",
    empresas: [{ empresaId: "emp-1", ativo: true }],
  };
  confere(
    (await podeOperarEmpresaRH(gestor, "emp-1")) === false,
    "GESTOR_SETOR com vínculo ativo no CNPJ NÃO opera a empresa pelo RH",
  );

  // 2. Varredura.
  const raiz = path.resolve(__dirname, "..");
  const rel = (p: string) => path.relative(raiz, p).split(path.sep).join("/");
  const alvos = [
    ...arquivos(path.join(raiz, "app/api/rh"), (f) => f.endsWith(".ts")),
    ...arquivos(path.join(raiz, "lib/actions"), (f) => /[\\/]rh-[^\\/]*\.ts$/.test(f)),
    ...arquivos(path.join(raiz, "app/actions"), (f) => /[\\/]rh-[^\\/]*\.ts$/.test(f)),
  ];
  confere(alvos.length > 10, `varredura encontrou os arquivos (${alvos.length})`);

  for (const f of alvos) {
    const r = rel(f);
    const chama = /usuarioAlcancaEmpresa\s*\(/.test(fs.readFileSync(f, "utf8"));
    if (!chama) continue;
    if (EXCECOES[r]) {
      console.log(`⏭️  ${r} — exceção: ${EXCECOES[r]}`);
      continue;
    }
    confere(false, `${r} ainda decide acesso com usuarioAlcancaEmpresa — use podeOperarEmpresaRH`);
  }

  console.log(falhas === 0 ? "\n✅ tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
