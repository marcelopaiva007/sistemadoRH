// "Esta sessão ainda vale?" — a decisão pura, sem banco, testada em
// scripts/test-sessao-revalidada.ts. Quem lê o banco é `dadosDaSessao`
// (lib/empresa-ativa.ts); quem aplica é o callback `jwt` de auth.ts.
//
// POR QUE EXISTE (25/11/2026): o login gravava `role`, `ativo` e os vínculos
// UserEmpresa dentro do JWT e nunca relia do banco. A sessão dura 30 dias
// (padrão do NextAuth), então desativar a conta, tirar um CNPJ, rebaixar o
// papel ou redefinir a senha não derrubava quem JÁ estava logado — inclusive
// quem tinha a senha vazada. Agora cada requisição confere o usuário de agora.
//
// POR QUE NÃO O `iat` DO TOKEN: no @auth/core instalado (0.41.3, jwt.js) o
// `encode` chama `setIssuedAt()` toda vez que o token é regravado — e ele é
// regravado em TODA requisição que passa pelo proxy (proxy.ts renova o
// cookie). O `iat` é "última renovação", não "quando entrou": comparado com o
// marcador, um token velho renovado depois da troca de senha passaria. Por
// isso o login grava o próprio instante em `entrouEm` (milissegundos), que o
// NextAuth carrega sem mexer.

/** O vínculo como vai para o token (`empresas[]`). */
export type EmpresaNaSessao = {
  empresaId: string;
  papel: "RH_MANAGER" | "GESTOR_SETOR";
  setorId: string | null;
  papelPrincipal: boolean;
  ativo: true;
};

/** O que a releitura do banco traz — `null` quando a conta não existe mais. */
export type UsuarioParaRevalidar = {
  ativo: boolean;
  role: string;
  sessoesValidasDesde: Date | null;
  /** Só os vínculos ATIVOS, principal primeiro, depois os mais antigos. */
  empresas: EmpresaNaSessao[];
};

/**
 * A sessão aberta em `entrouEm` (ms desde 1970, gravado no login) ainda vale
 * para este usuário?
 *
 * - conta apagada ou desativada: não;
 * - marcador nulo: sim (nada a derrubar — toda conta antes de 25/11/2026);
 * - token sem `entrouEm` (emitido antes desta versão) com marcador gravado:
 *   não. Não há como saber se ele é anterior à troca de senha, e o `iat` não
 *   serve (ver o topo do arquivo). Só cai quem teve conta desativada ou senha
 *   trocada; os demais seguem logados;
 * - entrou ANTES do marcador: não; no mesmo milissegundo ou depois: sim — é o
 *   caso de quem troca a senha em Conta e é logado de novo na mesma action.
 */
export function sessaoAindaVale(
  usuario: UsuarioParaRevalidar | null,
  entrouEm: unknown,
): usuario is UsuarioParaRevalidar {
  if (!usuario || !usuario.ativo) return false;
  if (!usuario.sessoesValidasDesde) return true;
  if (typeof entrouEm !== "number" || !Number.isFinite(entrouEm)) return false;
  return entrouEm >= usuario.sessoesValidasDesde.getTime();
}

// Resolve qual empresa cair no `empresaAtivaId` do JWT. Ordem:
//   1. Cookie, se apontar para uma empresa onde o user tem UserEmpresa ativo.
//   2. UserEmpresa com papelPrincipal=true.
//   3. Primeira UserEmpresa ativa.
//   4. null (ADMIN/DIRETORIA sem empresa específica).
// Recebe os vínculos já lidos (no login, os do `authorize`; nas demais
// requisições, os da mesma releitura que decidiu se a sessão vale) — sem
// segunda consulta.
export function escolherEmpresaAtiva(
  vinculos: EmpresaNaSessao[],
  cookie: { empresaId: string } | null,
): { empresaId: string; setorId: string | null } | null {
  if (vinculos.length === 0) return null;

  if (cookie) {
    const match = vinculos.find((v) => v.empresaId === cookie.empresaId);
    if (match) return { empresaId: match.empresaId, setorId: match.setorId };
  }

  const principal = vinculos.find((v) => v.papelPrincipal) ?? vinculos[0];
  return { empresaId: principal.empresaId, setorId: principal.setorId };
}
