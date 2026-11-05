// Para onde o login da área de administração devolve a pessoa (`?volta=`).
//
// Edge-safe de propósito (sem Prisma, sem Node): é lido pelo proxy
// (auth.config.ts) e pela página /admin/login.
//
// Só aceita caminho DENTRO de /admin e relativo à própria origem — um `volta`
// que levasse para fora seria um redirecionamento aberto (o link do login
// mandando a pessoa, já logada, para um site qualquer). O próprio login fica
// de fora, para não voltar a ele em círculo.

export const CAMINHO_PADRAO_DO_ADMIN = "/admin";

export function voltaDoAdmin(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  if (!valor.startsWith("/admin/")) return null;
  // Barra invertida e controle não têm o que fazer num caminho nosso — e
  // alguns navegadores tratam "\" como "/", o que abriria "//outro-site".
  for (const caractere of valor) {
    if (caractere === "\\" || caractere.charCodeAt(0) < 32) return null;
  }
  if (valor === "/admin/login" || valor.startsWith("/admin/login/") || valor.startsWith("/admin/login?")) return null;
  return valor;
}
