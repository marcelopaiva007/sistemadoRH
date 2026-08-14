// Regras que impedem o sistema de ficar sem dono.
//
// POR QUE ARQUIVO SEPARADO, e não junto das actions: lib/actions/usuarios.ts
// é `"use server"`, e ali TODA função exportada vira endpoint POST acessível
// pelo navegador. Exportar uma função pura de lá só para poder testá-la
// abriria um endpoint que ninguém revisa — o mesmo motivo pelo qual duas
// funções sem chamador foram removidas de app/actions/rh-ponto.ts.
//
// Puras e sem I/O: quem consulta o banco é a action; aqui só se decide.

export type EstadoDoUsuario = { role: string; ativo: boolean };

/**
 * Esta alteração deixaria o sistema sem nenhum ADMIN ativo?
 *
 * O ADMIN é o único papel que administra empresas (`requireAdmin`). Sem
 * nenhum ativo, ninguém mais cria CNPJ nem conserta o que travou — e não há
 * tela para sair dessa situação, só acesso direto ao banco.
 *
 * TRÊS PORTAS PARA O MESMO BURACO, e é por isso que a regra é uma só:
 * excluir o último ADMIN, DESATIVÁ-LO, ou trocar o PAPEL dele. Até 14/08/2026
 * apenas a primeira era barrada — editar chegava ao mesmo lugar sem
 * resistência nenhuma.
 *
 * `outrosAdminsAtivos` é contado pela action, excluindo o próprio alvo.
 */
export function deixariaSistemaSemAdmin(
  antes: EstadoDoUsuario,
  depois: EstadoDoUsuario,
  outrosAdminsAtivos: number,
): boolean {
  // Quem não era ADMIN ativo não é o último de nada.
  if (antes.role !== "ADMIN" || !antes.ativo) return false;
  if (outrosAdminsAtivos > 0) return false;
  // É o último: só passa se continuar ADMIN E ativo.
  return depois.role !== "ADMIN" || !depois.ativo;
}
