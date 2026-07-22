import { normalizarTexto } from "@/lib/text";

// Casamento de vendedores vindos de sistemas externos (elleven, L&M Movel)
// com o cadastro de Funcionários. Extraído de lib/actions/elleven.ts para ser
// reutilizado pela importação de chips ("use server" não permite exportar
// helpers síncronos de lá).

// Partículas que não ajudam a identificar a pessoa ("José DE Souza").
const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e"]);

export function tokensNome(nome: string): string[] {
  return normalizarTexto(nome)
    .split(" ")
    .filter((t) => t && !PARTICULAS.has(t));
}

// O sistema externo costuma registrar o nome completo ("JOÃO MARCELO FERNANDES
// DA SILVA") enquanto o cadastro tem a forma curta ("JOÃO MARCELO FERNANDES").
// Consideramos "provável mesma pessoa" quando todos os tokens do nome mais
// curto aparecem, na mesma ordem, no nome mais longo.
export function tokensContidosEmOrdem(menor: string[], maior: string[]): boolean {
  if (menor.length < 2) return false;
  let i = 0;
  for (const t of maior) {
    if (t === menor[i]) i++;
    if (i === menor.length) return true;
  }
  return false;
}

export function somenteDigitos(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

export type FuncionarioParaMatch = {
  id: string;
  nome: string;
  cpf: string | null;
};

// Ordem de preferência: CPF (identificador forte, o L&M Movel registra o
// documento do vendedor) -> nome exato normalizado -> tokens contidos em ordem
// (melhor score = nome curto mais longo que casou).
export function matchFuncionario<F extends FuncionarioParaMatch>(
  funcionarios: F[],
  alvo: { nome: string; cpf?: string | null }
): F | null {
  const cpfAlvo = somenteDigitos(alvo.cpf);
  if (cpfAlvo.length === 11) {
    const porCpf = funcionarios.find((f) => somenteDigitos(f.cpf) === cpfAlvo);
    if (porCpf) return porCpf;
  }

  const nomeAlvo = normalizarTexto(alvo.nome);
  const porNome = funcionarios.find((f) => normalizarTexto(f.nome) === nomeAlvo);
  if (porNome) return porNome;

  const tokensAlvo = tokensNome(alvo.nome);
  let melhor: F | null = null;
  let melhorScore = 0;
  for (const f of funcionarios) {
    const tokensCadastro = tokensNome(f.nome);
    const [menor, maior] =
      tokensCadastro.length <= tokensAlvo.length
        ? [tokensCadastro, tokensAlvo]
        : [tokensAlvo, tokensCadastro];
    if (tokensContidosEmOrdem(menor, maior) && menor.length > melhorScore) {
      melhorScore = menor.length;
      melhor = f;
    }
  }
  return melhor;
}
