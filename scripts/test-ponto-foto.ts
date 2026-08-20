// Guarda da regra "foto obrigatória na batida" (lib/ponto-foto.ts).
//
// POR QUE EXISTE. A regra é a razão de ser do commit de 20/08/2026 (pedido
// explícito do RH) e vive numa função que NENHUM outro teste atravessa: um
// refactor que a enfraquecesse passava verde em type-check, lint e nos 29
// smokes — e batida sem foto voltava a registrar em produção, invisível,
// porque linha "sem foto" também é o estado legítimo de falha de infra do
// Blob. A revisão do próprio dia 20/08 achou dois furos que este arquivo
// agora prega: base64 que decodifica para 0 bytes passava como "sem foto",
// e 1 byte de lixo passava como foto de verdade (comFoto: true).
//
// Roda sem banco — regra pura — no job `verificar` do CI.
import { fotoDeBatidaValida, LIMITE_FOTO_DATA_URL } from "../lib/ponto-foto";

let falhas = 0;

function caso(nome: string, obtido: boolean, esperado: boolean) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${ok ? "" : ` (esperava ${esperado}, veio ${obtido})`}`);
}

// Monta um data URL do formato pedido com os bytes dados, completados com
// zeros até um tamanho plausível de foto real.
function dataUrl(formato: "jpeg" | "png", inicio: number[], tamanho = 2048): string {
  const bytes = Buffer.alloc(tamanho);
  Buffer.from(inicio).copy(bytes);
  return `data:image/${formato};base64,${bytes.toString("base64")}`;
}

const MAGIC_JPEG = [0xff, 0xd8, 0xff, 0xe0];
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

console.log("1. O que uma câmera de verdade envia passa:");
caso("JPEG com assinatura FF D8 FF", fotoDeBatidaValida(dataUrl("jpeg", MAGIC_JPEG)), true);
caso("PNG com assinatura 89 50 4E 47 (fallback de toDataURL)", fotoDeBatidaValida(dataUrl("png", MAGIC_PNG)), true);

console.log("2. Sem foto não registra — os jeitos de não mandar foto:");
caso("null", fotoDeBatidaValida(null), false);
caso("undefined", fotoDeBatidaValida(undefined), false);
caso("string vazia", fotoDeBatidaValida(""), false);
caso("data URL de outro formato (image/gif)", fotoDeBatidaValida(`data:image/gif;base64,${Buffer.alloc(2048).toString("base64")}`), false);
caso("texto que não é data URL", fotoDeBatidaValida("uma foto qualquer"), false);

console.log("3. Os furos da revisão de 20/08/2026 continuam pregados:");
caso("base64 que decodifica para 0 bytes (\"=\")", fotoDeBatidaValida("data:image/jpeg;base64,="), false);
caso("1 byte de lixo (\"AA==\") não vira comFoto: true", fotoDeBatidaValida("data:image/jpeg;base64,AA=="), false);
caso("payload grande SEM a assinatura JPEG", fotoDeBatidaValida(dataUrl("jpeg", [0x00, 0x01, 0x02, 0x03])), false);
caso("assinatura de PNG declarada como JPEG", fotoDeBatidaValida(dataUrl("jpeg", MAGIC_PNG)), false);

console.log("4. O teto de payload segue valendo:");
caso(
  "acima de 1,5 MB de base64 é recusado",
  fotoDeBatidaValida(dataUrl("jpeg", MAGIC_JPEG, Math.ceil((LIMITE_FOTO_DATA_URL * 3) / 4) + 1024)),
  false,
);

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
