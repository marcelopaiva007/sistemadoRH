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

// `undefined` além de `null` porque na sessão do next-auth os dois campos são
// opcionais (ver types/next-auth.d.ts): quem ainda não resolveu empresa ativa
// chega aqui sem a chave, e não com a chave valendo null.
export type SessaoDoGestor = {
  role: string;
  empresaAtivaId?: string | null;
  setorAtivaId?: string | null;
  empresas: { empresaId: string; ativo: boolean }[];
};

/**
 * Este gestor de setor consegue abrir "Meu Setor"?
 *
 * A tela precisa de três coisas ao mesmo tempo: o papel, uma empresa ativa e o
 * setor dessa empresa. Falta qualquer uma e não há o que mostrar — o setor é o
 * recorte de TUDO que a tela exibe.
 *
 * Existe como função pura porque a resposta é lida de DOIS lados, e eles
 * precisam concordar: a home decide se manda o gestor para lá, e a própria
 * tela decide se mostra o setor ou a explicação. Enquanto cada lado julgava
 * por conta, os dois discordavam e o navegador ficava em branco — a home
 * mandava para /rh/meu-setor, /rh/meu-setor devolvia para a home, e assim sem
 * parar (ver `requireGestorSetor`).
 */
export function gestorSetorPodeAbrirMeuSetor(user: SessaoDoGestor): boolean {
  if (user.role !== "GESTOR_SETOR") return false;
  if (!user.empresaAtivaId || !user.setorAtivaId) return false;
  return user.empresas.some((e) => e.empresaId === user.empresaAtivaId && e.ativo);
}

/**
 * Esta edição está PROMOVENDO alguém a gestor de setor sem setor nenhum?
 *
 * A tela de edição de usuário troca o papel e mais nada — ela não tem campo de
 * setor, que mora em "Vincular". Sem esta trava, marcar "Gestor de setor" ali
 * entregava um login que não abre tela nenhuma, e nada na tela avisava.
 *
 * Só a PROMOÇÃO é barrada, e não toda edição de um gestor: quem já é gestor e
 * está com o vínculo pela metade precisa continuar editável — é assim que o RH
 * corrige o nome, o e-mail ou reativa a pessoa enquanto arruma o vínculo.
 */
export function promoveriaAGestorSemSetor(
  antes: { role: string },
  depois: { role: string },
  vinculos: { ativo: boolean; setorId: string | null }[],
): boolean {
  if (depois.role !== "GESTOR_SETOR") return false;
  if (antes.role === "GESTOR_SETOR") return false;
  return !vinculos.some((v) => v.ativo && v.setorId);
}
