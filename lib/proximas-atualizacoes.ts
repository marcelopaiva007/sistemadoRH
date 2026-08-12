// O que vem a seguir — alimenta o bloco "Próximas atualizações" da tela de
// Atualizações, acima do histórico.
//
// POR QUE ISTO EXISTE. A tela só respondia "o que já mudou". Quem usa o sistema
// também pergunta "o que vem", e sem uma resposta na tela essa conversa
// acontecia por fora, em memória de quem participou da reunião. Aqui ela fica
// escrita, com o mesmo peso do histórico.
//
// REGRA. Só entra o que está de fato combinado. Este arquivo NÃO é lista de
// desejos: um item que fica meses parado ensina o leitor a não confiar na
// lista inteira. Quando um item entrega, ele SAI daqui e vira entrada em
// lib/atualizacoes.ts — no mesmo commit.
//
// `bloqueio` é o campo mais honesto da lista: diz por que algo ainda não
// começou. "Aguardando decisão" é informação; silêncio parece esquecimento.

export type Situacao =
  /** Combinado e pronto para começar — só depende de tempo de trabalho. */
  | "PRONTO_PARA_COMECAR"
  /** Depende de alguém decidir escopo, contratar, ou fornecer algo. */
  | "AGUARDANDO_DECISAO"
  /** Em andamento agora. */
  | "EM_ANDAMENTO";

export type ProximaAtualizacao = {
  titulo: string;
  /** O que muda para quem usa — não a tarefa técnica. */
  descricao: string;
  situacao: Situacao;
  /** O que trava, quando trava. Vazio quando nada trava. */
  bloqueio?: string;
};

export const SITUACAO_LABEL: Record<Situacao, string> = {
  PRONTO_PARA_COMECAR: "Pronto para começar",
  AGUARDANDO_DECISAO: "Aguardando decisão",
  EM_ANDAMENTO: "Em andamento",
};

export const PROXIMAS_ATUALIZACOES: ProximaAtualizacao[] = [
  {
    titulo: "Ponto por biometria ou reconhecimento facial",
    descricao:
      "Registrar a batida sem digitar nada, direto no equipamento. Hoje o ponto é registrado pelo sistema, e a conferência de quem bateu depende de IP e localização.",
    situacao: "AGUARDANDO_DECISAO",
    bloqueio:
      "Depende de escolher e comprar o equipamento — custo e instalação. A ligação com o sistema, essa não depende da marca: todo relógio de ponto legal no Brasil é obrigado a gerar o arquivo AFD no formato da Portaria 671, e é esse arquivo que o sistema passaria a ler. O sistema já GERA o AFD (para a fiscalização); falta LER o que vem do equipamento.",
  },
  {
    titulo: "Envio automático para a folha de pagamento",
    descricao:
      "Os eventos do mês saindo do sistema direto para o escritório de contabilidade, sem exportar e reenviar o CSV à mão.",
    situacao: "AGUARDANDO_DECISAO",
    bloqueio:
      "O sistema da contabilidade é o Domínio (Thomson Reuters) — isso já está respondido. O que falta vem de lá, não daqui: um arquivo de importação de exemplo e a lista de códigos de rubrica que o escritório usa (qual código é hora extra 50%, adicional noturno, falta, DSR). Esses códigos são cadastrados por escritório, não são iguais para todo mundo — sem eles, o arquivo sairia com número certo na rubrica errada.",
  },
  {
    titulo: "Avisos automáticos para o gestor",
    descricao:
      "O gestor recebe, pelo Telegram, o que sai do previsto no time dele — contrato de experiência vencendo, férias a vencer, hora extra acima do limite — em vez de depender de alguém abrir a tela e reparar.",
    situacao: "EM_ANDAMENTO",
  },
  {
    titulo: "Vídeos curtos de treinamento",
    descricao:
      "Complemento ao \"Como usar\" que já existe em cada tela. O texto continua sendo a referência — o vídeo ajuda em fluxo longo, como a admissão completa.",
    situacao: "AGUARDANDO_DECISAO",
    bloqueio: "Depende de alguém gravar. Nada no sistema trava por causa disso.",
  },
];
