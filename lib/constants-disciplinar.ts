// Constantes e auxiliadores do Módulo Disciplinar (Medidas & Notificações)

export type TipoOcorrenciaDisciplinar =
  | "ADVERTENCIA_VERBAL"
  | "ADVERTENCIA_ESCRITA"
  | "SUSPENSAO"
  | "JUSTA_CAUSA"
  | "ABANDONO_EMPREGO"
  | "USO_INDEVIDO_EPI"
  | "DANO_PATRIMONIAL"
  | "RECUSA_EXAME";

export type StatusAssinaturaDisciplinar =
  | "PENDENTE"
  | "ASSINADO"
  | "RECUSADO_COM_TESTEMUNHAS";

export const TIPOS_OCORRENCIA_DISCIPLINAR: {
  value: TipoOcorrenciaDisciplinar;
  label: string;
  descricao: string;
  gravidade: "leve" | "media" | "alta" | "critica";
}[] = [
  {
    value: "ADVERTENCIA_VERBAL",
    label: "Advertência Verbal",
    descricao: "Registro formal interno de orientação verbal por falha leve ou primeiro atraso.",
    gravidade: "leve",
  },
  {
    value: "ADVERTENCIA_ESCRITA",
    label: "Advertência Escrita",
    descricao: "Formalização por descumprimento de normas, atrasos recorrentes ou indisciplina.",
    gravidade: "media",
  },
  {
    value: "SUSPENSAO",
    label: "Suspensão Disciplinar",
    descricao: "Punição temporária com afastamento e desconto em folha por infração grave ou reincidência.",
    gravidade: "alta",
  },
  {
    value: "JUSTA_CAUSA",
    label: "Demissão por Justa Causa",
    descricao: "Rescisão motivada por falta grave (Art. 482 da CLT).",
    gravidade: "critica",
  },
  {
    value: "ABANDONO_EMPREGO",
    label: "Notificação de Abandono de Emprego",
    descricao: "Convocação formal por ausência injustificada superior a 30 dias consecutivos.",
    gravidade: "critica",
  },
  {
    value: "USO_INDEVIDO_EPI",
    label: "Termo por Recusa / Mau Uso de EPI",
    descricao: "Notificação por recusa deliberada em utilizar equipamento de proteção (NR-06 / CLT Art. 158).",
    gravidade: "alta",
  },
  {
    value: "DANO_PATRIMONIAL",
    label: "Termo de Responsabilidade por Dano",
    descricao: "Apontamento e termo de ressarcimento por avarias no patrimônio da empresa (CLT Art. 462 § 1º).",
    gravidade: "alta",
  },
  {
    value: "RECUSA_EXAME",
    label: "Termo de Recusa a Exame Ocupacional",
    descricao: "Registro de recusa a submissão de ASO (admissional, periódico ou demissional).",
    gravidade: "media",
  },
];

export const STATUS_ASSINATURA_DISCIPLINAR: Record<
  StatusAssinaturaDisciplinar,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDENTE: { label: "Aguardando Assinatura", variant: "outline" },
  ASSINADO: { label: "Assinado pelo Colaborador", variant: "default" },
  RECUSADO_COM_TESTEMUNHAS: {
    label: "Recusado (com 2 Testemunhas)",
    variant: "destructive",
  },
};
