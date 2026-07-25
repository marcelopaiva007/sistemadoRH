// Testes do acesso ao portal do colaborador (lib/portal-auth.ts) contra o banco
// de verdade. Não usa transação porque as funções testadas usam o client
// global; em vez disso, apaga no fim exatamente as linhas que criou e confere
// que não sobrou nada.
//
//   npx tsx scripts/test-portal.ts
import "dotenv/config";

// A geração do link exige a URL pública (em produção vem da Vercel).
process.env.NEXT_PUBLIC_APP_URL ??= "https://sistemado-rh-two.vercel.app";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { consumirLinkDeAcesso, criarLinkDeAcesso, cpfConfere } from "@/lib/portal-auth";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const tokenDaUrl = (url: string) => url.split("/").pop()!;

async function main() {
  const colaborador = await prisma.colaborador.findFirst({
    where: { ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador cadastrado — rode a importação antes.");
  console.log(`Colaborador de teste: ${colaborador.nome}\n`);

  try {
    console.log("1. Geração do link");
    const primeiro = await criarLinkDeAcesso(colaborador.id);
    ok(primeiro.ok, "gera o link quando não há outro recente");
    if (!primeiro.ok) throw new Error("sem link para continuar os testes");
    ok(primeiro.url.includes("/portal/entrar/"), "o link aponta para a rota de entrada");

    const token = tokenDaUrl(primeiro.url);
    const guardado = await prisma.portalAcesso.findUnique({ where: { tokenHash: hash(token) } });
    ok(guardado !== null, "o banco guarda o hash do token");
    const emClaro = await prisma.portalAcesso.count({ where: { tokenHash: token } });
    ok(emClaro === 0, "o token em claro NÃO está no banco");

    console.log("2. Pedido repetido");
    const segundo = await criarLinkDeAcesso(colaborador.id);
    ok(!segundo.ok && segundo.motivo === "link_recente", "pedir de novo em seguida não gera outro link");

    console.log("3. Uso único");
    const entrada = await consumirLinkDeAcesso(token);
    ok(entrada.ok, "o link abre a sessão na primeira vez");
    const repetida = await consumirLinkDeAcesso(token);
    ok(!repetida.ok && repetida.motivo === "usado", "o mesmo link não abre uma segunda vez");

    console.log("4. Token inválido e expirado");
    const inexistente = await consumirLinkDeAcesso("token-que-nunca-existiu");
    ok(!inexistente.ok && inexistente.motivo === "invalido", "token desconhecido é recusado");

    const expirado = await prisma.portalAcesso.create({
      data: {
        colaboradorId: colaborador.id,
        tokenHash: hash("token-expirado-de-teste"),
        expiraEm: new Date(Date.now() - 1000),
      },
    });
    const tentativaExpirada = await consumirLinkDeAcesso("token-expirado-de-teste");
    ok(!tentativaExpirada.ok && tentativaExpirada.motivo === "expirado", "token vencido é recusado");
    void expirado;

    console.log("5. Um link vivo por vez");
    await prisma.portalAcesso.updateMany({
      where: { colaboradorId: colaborador.id },
      // Envelhece os registros para sair da janela de reaproveitamento.
      data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    const antigo = await criarLinkDeAcesso(colaborador.id);
    ok(antigo.ok, "passada a janela, gera link novo");
    if (antigo.ok) {
      await prisma.portalAcesso.updateMany({
        where: { colaboradorId: colaborador.id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      const maisNovo = await criarLinkDeAcesso(colaborador.id);
      ok(maisNovo.ok, "gera mais um link");
      const anterior = await consumirLinkDeAcesso(tokenDaUrl(antigo.url));
      ok(!anterior.ok, "pedir um link novo invalida o anterior");
    }

    console.log("6. Confirmação de CPF");
    ok(cpfConfere("123.456.789-09", "12345678909"), "aceita CPF com pontuação");
    ok(!cpfConfere("12345678900", "12345678909"), "recusa CPF errado");
    ok(!cpfConfere("", "12345678909"), "recusa CPF vazio");
    ok(!cpfConfere("12345678909", null), "recusa quando não há CPF no cadastro");
  } finally {
    console.log("\n7. Limpeza");
    const sessoes = await prisma.portalSessao.deleteMany({ where: { colaboradorId: colaborador.id } });
    const acessos = await prisma.portalAcesso.deleteMany({ where: { colaboradorId: colaborador.id } });
    console.log(`  removidos: ${acessos.count} acesso(s), ${sessoes.count} sessão(ões)`);
    const sobrou =
      (await prisma.portalAcesso.count({ where: { colaboradorId: colaborador.id } })) +
      (await prisma.portalSessao.count({ where: { colaboradorId: colaborador.id } }));
    ok(sobrou === 0, "nada de teste sobrou no banco");
  }

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
