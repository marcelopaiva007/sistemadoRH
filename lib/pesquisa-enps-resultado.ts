// Resultado do pulso eNPS (P05-ENPS) — fase 6 do roadmap de 02/08/2026.
// Reaproveita a matemática de lib/clima.ts::calcularNPS (mesma fórmula —
// %promotores − %detratores — já usada e testada em produção pelo NPS do
// Clima), mas classifica pelas zonas do seed (lib/zonas.ts::ZONAS_ENPS), não
// por `clima.ts::classificarNPS`: são réguas diferentes para instrumentos
// diferentes, e P05-ENPS é novo — livre pra usar a régua do seed sem herdar
// os cortes que o Clima já usa em produção.
import { calcularNPS } from "@/lib/clima";
import { classificarEmZona, ZONAS_ENPS, type Zona } from "@/lib/zonas";

export type ResultadoEnps = {
  promotores: number;
  neutros: number;
  detratores: number;
  total: number;
  score: number; // -100 a 100
  zona: Zona | null;
};

export function calcularResultadoEnps(respostas: { valorNumerico: number | null }[]): ResultadoEnps | null {
  const nps = calcularNPS(respostas);
  if (!nps) return null;
  return { ...nps, zona: classificarEmZona(nps.score, ZONAS_ENPS) };
}
