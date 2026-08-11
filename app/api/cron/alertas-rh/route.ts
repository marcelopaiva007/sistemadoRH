// Motor de alertas (fase 3, lib/alertas.ts) — roda 1×/dia. Cada checagem
// dispara e-mail com dedupe diário (ver lib/alertas.ts para o porquê disso
// ser "de novo todo dia" e não "só uma vez").
//
// Desde a Central de Sinais, a mesma passada também PERSISTE: cada situação
// detectada (dos 3 alertas E do radar de desvio) vira/atualiza um `Sinal`,
// que é onde dono, prazo e desfecho ficam registrados (lib/sinais.ts). O
// e-mail continua saindo — é o toque no ombro; o sinal é a memória.

import { NextRequest, NextResponse } from "next/server";
import { verificarPlanosDeAcaoVencidos, verificarDesligamentosConcentrados, verificarTaxaRespostaBaixa, type ResultadoAlertas } from "@/lib/alertas";
import { coletarCandidatosDeAnomalias, registrarSinais } from "@/lib/sinais-registro";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 60;

// O JSON de resposta é log de operação: os candidatos completos iriam
// duplicados (já estão no banco) e com frase inteira — só as contagens dizem
// se a rodada foi saudável.
const resumo = (r: ResultadoAlertas) => ({ avaliados: r.avaliados, disparados: r.disparados, erros: r.erros });

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vercel.json chama esta rota a cada 15 min; só roda de fato perto do
  // horário configurado em Configuração → Lembretes (padrão 10:00). Disparo
  // manual (?secret=) ignora o horário de propósito — ver lib/cron-horario.ts.
  if (origem === "cron" && !(await deveRodarAgora("alertas-rh"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  const [planosVencidos, desligamentos, taxaResposta, anomalias] = await Promise.all([
    verificarPlanosDeAcaoVencidos(),
    verificarDesligamentosConcentrados(),
    verificarTaxaRespostaBaixa(),
    coletarCandidatosDeAnomalias(),
  ]);

  const sinais = await registrarSinais([
    ...planosVencidos.candidatos,
    ...desligamentos.candidatos,
    ...taxaResposta.candidatos,
    ...anomalias,
  ]);

  return NextResponse.json({
    ok: true,
    AL09_planosVencidos: resumo(planosVencidos),
    AL10_desligamentosConcentrados: resumo(desligamentos),
    AL08_taxaRespostaBaixa: resumo(taxaResposta),
    sinais,
  });
}
