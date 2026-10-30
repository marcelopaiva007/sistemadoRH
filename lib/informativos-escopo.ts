// Que CNPJs a tela de Informativos enxerga — separado de lib/informativos.ts
// porque aquele também roda no webhook do Telegram, que não tem usuário.
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";

/**
 * A MARCA do caminho, cortada pelo que o usuário enxerga — o mesmo padrão da
 * lista de Colaboradores. Informativo não atravessa marca: "Todos" na tela da
 * Vapt é a Vapt, nunca o grupo inteiro por acidente.
 *
 * A tela e a action chamam ESTA função: o público é sempre recalculado no
 * servidor, e id de pessoa/setor/CNPJ fora daqui é ignorado, não enviado.
 */
export async function escopoDosInformativos(
  usuario: Parameters<typeof empresasVisiveis>[0],
  empresaId: string,
): Promise<string[]> {
  const [daMarca, visiveis] = await Promise.all([empresasDaMesmaMarca(empresaId), empresasVisiveis(usuario)]);
  return daMarca.filter((id) => visiveis.includes(id));
}
