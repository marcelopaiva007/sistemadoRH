// Zonas de classificação — fase 6 do roadmap de 02/08/2026 (seed: chave
// "zonas"). Config central de faixa→rótulo→cor, fonte única em vez de cada
// motor de cálculo ter a própria tabela hardcoded.
//
// Escopo desta fase, por ora: só `enps` (novo, sem nada em produção pra
// quebrar). `favorabilidade` (usada hoje por `lib/clima.ts::classificarScore`,
// 4 faixas com cortes 40/60/75 — diferentes das 5 faixas do seed) e `irp`
// (redesenho do motor de risco do NR-01 pra um índice único 0-100 por área,
// hoje é nível por dimensão via matriz Probabilidade×Severidade) tocam
// relatório já entregue a cliente de verdade (PGR) e dashboard de clima já em
// uso — migrar os cortes/rótulos ali é decisão do Marcelo, não default de
// código. As duas tabelas ficam registradas aqui, prontas, mas não
// conectadas a `clima.ts`/`nr01.ts` ainda.
export type Zona = { min: number; max: number; rotulo: string; cor: string };

export const ZONAS_FAVORABILIDADE: Zona[] = [
  { min: 85, max: 100, rotulo: "Excelência", cor: "#00E5A0" },
  { min: 75, max: 84.99, rotulo: "Zona de Força", cor: "#8FD14F" },
  { min: 60, max: 74.99, rotulo: "Atenção", cor: "#FFC145" },
  { min: 45, max: 59.99, rotulo: "Risco", cor: "#FF8A3D" },
  { min: 0, max: 44.99, rotulo: "Crítico", cor: "#FF4757" },
];

export const ZONAS_ENPS: Zona[] = [
  { min: 71, max: 100, rotulo: "Excelência", cor: "#00E5A0" },
  { min: 31, max: 70, rotulo: "Qualidade", cor: "#8FD14F" },
  { min: 0, max: 30, rotulo: "Aperfeiçoamento", cor: "#FFC145" },
  { min: -100, max: -0.01, rotulo: "Crítico", cor: "#FF4757" },
];

export type ZonaIrp = Zona & { prazoPlanoDias: number; escalonamento: string[]; reavaliacaoDias?: number };

export const ZONAS_IRP: ZonaIrp[] = [
  { min: 0, max: 24, rotulo: "Baixo", cor: "#00E5A0", prazoPlanoDias: 60, escalonamento: ["gestor"] },
  { min: 25, max: 49, rotulo: "Moderado", cor: "#FFC145", prazoPlanoDias: 45, escalonamento: ["gestor", "rh"] },
  { min: 50, max: 74, rotulo: "Alto", cor: "#FF8A3D", prazoPlanoDias: 30, escalonamento: ["gestor", "rh", "diretoria", "sesmt"] },
  {
    min: 75,
    max: 100,
    rotulo: "Crítico",
    cor: "#FF4757",
    prazoPlanoDias: 15,
    escalonamento: ["diretoria", "sesmt", "juridico"],
    reavaliacaoDias: 90,
  },
];

/** Acha a faixa que contém `valor`; null se estiver fora de todas (não deveria acontecer com as tabelas acima). */
export function classificarEmZona<Z extends Zona>(valor: number, zonas: Z[]): Z | null {
  return zonas.find((z) => valor >= z.min && valor <= z.max) ?? null;
}
