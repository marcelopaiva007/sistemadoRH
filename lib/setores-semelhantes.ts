import { normalizarTexto } from "@/lib/text";

export type GrupoSetorSemelhante = {
  chaveStem: string;
  sugestaoNome: string;
  setores: {
    id: string;
    nome: string;
    colaboradoresCount: number;
    vagasCount: number;
    metasCount: number;
    ativo: boolean;
  }[];
  totalColaboradores: number;
};

// Dicionário explícito de equivalências e sinônimos de setores
const EQUIVALENCIAS_SETORES: Record<string, string> = {
  comercial: "vendas",
  "area comercial": "vendas",
  "area comercial vendas": "vendas",
  "comercial vendas": "vendas",
  venda: "vendas",
  adm: "administrativo",
  admin: "administrativo",
  "area administrativa": "administrativo",
  "departamento pessoal": "recursos humanos",
  dp: "recursos humanos",
  rh: "recursos humanos",
  "rec humanos": "recursos humanos",
  ti: "tecnologia da informacao (ti)",
  tech: "tecnologia da informacao (ti)",
  tecnologia: "tecnologia da informacao (ti)",
  fin: "financeiro",
  "area financeira": "financeiro",
  atendimento: "atendimento ao cliente",
  sac: "atendimento ao cliente",
  suporte: "atendimento ao cliente",
  almoxarifado: "almoxarifado e logistica",
  logistica: "almoxarifado e logistica",
  estoque: "almoxarifado e logistica",
};

/** Normaliza e extrai o termo canônico ou radical do setor */
export function extrairRadicalSetor(nome: string): string {
  const norm = normalizarTexto(nome).trim();
  if (EQUIVALENCIAS_SETORES[norm]) {
    return EQUIVALENCIAS_SETORES[norm];
  }

  // Verifica palavras isoladas (ex: "Setor Comercial" -> "vendas")
  const palavras = norm.split(/\s+/).filter((p) => p !== "setor" && p !== "area" && p !== "de");
  const normSemLimpeza = palavras.join(" ");

  if (EQUIVALENCIAS_SETORES[normSemLimpeza]) {
    return EQUIVALENCIAS_SETORES[normSemLimpeza];
  }

  return normSemLimpeza;
}

/** Agrupa setores por semelhança semântica (ex: "Comercial" + "Vendas", "RH" + "Recursos Humanos") */
export function agruparSetoresSemelhantes(
  setores: {
    id: string;
    nome: string;
    colaboradoresCount: number;
    vagasCount: number;
    metasCount: number;
    ativo: boolean;
  }[],
): GrupoSetorSemelhante[] {
  const grupos = new Map<string, GrupoSetorSemelhante>();
  const alocados = new Set<string>();

  for (const s of setores) {
    if (alocados.has(s.id)) continue;
    const radical = extrairRadicalSetor(s.nome);

    const semelhantes = setores.filter((outro) => {
      if (alocados.has(outro.id)) return false;
      const radicalOutro = extrairRadicalSetor(outro.nome);
      return radical === radicalOutro;
    });

    if (semelhantes.length > 1) {
      semelhantes.forEach((item) => alocados.add(item.id));

      // Ordena por quantidade de colaboradores desc
      semelhantes.sort((a, b) => b.colaboradoresCount - a.colaboradoresCount);

      const totalColabs = semelhantes.reduce((acc, item) => acc + item.colaboradoresCount, 0);

      // Se houver "Vendas" ou um nome canônico preferencial, usa como sugestão
      const preferencial = semelhantes.find((item) => {
        const n = normalizarTexto(item.nome);
        return n === "vendas" || n === "administrativo" || n === "financeiro" || n === "recursos humanos";
      });

      const sugestao = preferencial ? preferencial.nome : semelhantes[0].nome.trim();

      grupos.set(radical, {
        chaveStem: radical,
        sugestaoNome: sugestao,
        setores: semelhantes,
        totalColaboradores: totalColabs,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.setores.length - a.setores.length);
}
