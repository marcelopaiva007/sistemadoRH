// Endereço da rota que confere a sessão e acerta o cookie
// (app/api/sessao/conferir/route.ts). Os guardas de página (requireUser,
// requireAreaAdmin) mandam para cá em vez de direto para o login — ver o
// porquê na própria rota. Fica num módulo à parte para os guardas não
// importarem o arquivo de rota.
export const CONFERIR_SESSAO = "/api/sessao/conferir";
export const CONFERIR_SESSAO_ADMIN = "/api/sessao/conferir?para=admin";
