// Tipos compartilhados pelas telas da pesquisa (visão geral, perguntas,
// convites e resultados). Cada tela carrega só o seu pedaço — a pesquisa
// inteira nunca mais é montada de uma vez.

export type Opcao = { id: string; texto: string };

export type Pergunta = {
  id: string;
  enunciado: string;
  tipo: string;
  dimensaoGPTW: string | null;
  codigo: string | null;
  dimensao: string | null;
  invertida: boolean;
  obrigatoria: boolean;
  opcoes: Opcao[];
};

export type Token = {
  id: string;
  status: string;
  canal: string;
  erro: string | null;
  enviadoEm: Date | null;
  colaborador: { id: string; nome: string };
};

/** Dados de cabeçalho — o que toda tela da pesquisa precisa saber. */
export type PesquisaBase = {
  id: string;
  titulo: string;
  descricao: string | null;
  anonima: boolean;
  status: string;
  modelo: string;
};
