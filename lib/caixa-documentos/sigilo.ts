// Caixa de documentos — o inventário de páginas sem CPF nem PIS guardados.
//
// O inventário (quem aparece em cada página) serve só para uma pergunta: "esta
// página é SÓ desta pessoa?". Para isso basta comparar identificadores, não
// guardá-los: cada CPF/PIS vira uma marca HMAC com o segredo do servidor. Sem o
// segredo, a marca não volta a ser CPF — nem por força bruta, que é o risco de
// um hash simples (são só 10^9 CPFs possíveis). Uma folha de 200 páginas não
// deixa 200 CPFs guardados num JSON para sempre (LGPD).
import { createHmac } from "node:crypto";

function segredo(): string {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "caixa-documentos";
}

/** A marca de um CPF ou PIS (só dígitos). Mesma entrada, mesma marca. */
export function marcaDoId(digitos: string): string {
  return createHmac("sha256", segredo()).update(`caixa:${digitos}`).digest("hex").slice(0, 24);
}

/** As marcas de uma pessoa, para comparar com o inventário. */
export function marcasDe(...ids: (string | null | undefined)[]): string[] {
  return ids.filter((x): x is string => !!x).map((x) => marcaDoId(x.replace(/\D/g, "")));
}
