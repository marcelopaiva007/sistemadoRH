// Conferência CLT da escala (lib/escala-clt.ts): interjornada de 11h (art.
// 66), 24h de descanso por semana (art. 67) e domingo a cada 7 semanas.
// Nada aqui toca o banco.
//   npx tsx scripts/test-escala-clt.ts
import { conferirEscalaClt, type TurnoDaPessoa, type ViolacaoClt } from "@/lib/escala-clt";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const de = (v: ViolacaoClt[], tipo: ViolacaoClt["tipo"]) => v.filter((x) => x.tipo === tipo);
/** "AAAA-MM-DD" somando dias a partir de uma data. */
function dia(base: string, mais: number): string {
  const [a, m, d] = base.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + mais)).toISOString().slice(0, 10);
}

// 02/11/2026 é segunda-feira; 08/11/2026, domingo.
const SEG = "2026-11-02";
const UMA_SEMANA = { inicio: SEG, fim: dia(SEG, 6) };

console.log("Interjornada (CLT art. 66)");
{
  // Fim às 19h00; o seguinte começa às 06h00 = 11h00 exatas: cumpre.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "OUTRO", inicioMin: 8 * 60, fimMin: 19 * 60 },
      { data: dia(SEG, 1), turno: "OUTRO", inicioMin: 6 * 60, fimMin: 14 * 60 },
    ],
    UMA_SEMANA,
  );
  ok(de(v, "INTERJORNADA").length === 0, "11h00 de descanso: sem aviso");
}
{
  // Um minuto a menos: 10h59.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "OUTRO", inicioMin: 8 * 60, fimMin: 19 * 60 },
      { data: dia(SEG, 1), turno: "OUTRO", inicioMin: 5 * 60 + 59, fimMin: 14 * 60 },
    ],
    UMA_SEMANA,
  );
  const inter = de(v, "INTERJORNADA");
  ok(inter.length === 1, "10h59 de descanso: 1 aviso");
  ok(inter[0]?.data === dia(SEG, 1), "o aviso cai no dia do turno seguinte");
  ok(inter[0]?.mensagem.includes("10h59") ?? false, "a mensagem diz quanto descansou (10h59)");
}
{
  // Tarde (sai 22h) seguida de Manhã (entra 6h): 8h, pelo horário presumido.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "TARDE" },
      { data: dia(SEG, 1), turno: "MANHA" },
    ],
    UMA_SEMANA,
  );
  ok(de(v, "INTERJORNADA").length === 1, "Tarde -> Manhã no dia seguinte: aviso");
}
{
  // Noite (22h às 6h) seguida de Noite: 16h — cumpre.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "NOITE" },
      { data: dia(SEG, 1), turno: "NOITE" },
    ],
    UMA_SEMANA,
  );
  ok(de(v, "INTERJORNADA").length === 0, "Noite -> Noite: 16h, sem aviso");
}
{
  // Turno do catálogo sem horário conhecido não entra na conta de horas.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "Sobreaviso" },
      { data: dia(SEG, 1), turno: "MANHA" },
    ],
    UMA_SEMANA,
  );
  ok(de(v, "INTERJORNADA").length === 0, "turno sem horário: não acusa interjornada");
}
{
  // Folga não é jornada.
  const v = conferirEscalaClt(
    [
      { data: SEG, turno: "TARDE" },
      { data: dia(SEG, 1), turno: "FOLGA" },
      { data: dia(SEG, 2), turno: "MANHA" },
    ],
    UMA_SEMANA,
  );
  ok(de(v, "INTERJORNADA").length === 0, "Tarde, Folga, Manhã: sem aviso");
}

console.log("DSR — 24h seguidas na semana (CLT art. 67)");
{
  const seteDias: TurnoDaPessoa[] = Array.from({ length: 7 }, (_, i) => ({ data: dia(SEG, i), turno: "INTEGRAL" }));
  const v = conferirEscalaClt(seteDias, UMA_SEMANA);
  const dsr = de(v, "DSR_SEMANAL");
  ok(dsr.length === 1, "7 dias de Integral: semana sem 24h de folga");
  ok(dsr[0]?.data === dia(SEG, 6), "o aviso cai no domingo da semana");
}
{
  const seisDias: TurnoDaPessoa[] = Array.from({ length: 6 }, (_, i) => ({ data: dia(SEG, i), turno: "INTEGRAL" }));
  const v = conferirEscalaClt([...seisDias, { data: dia(SEG, 6), turno: "FOLGA" }], UMA_SEMANA);
  ok(de(v, "DSR_SEMANAL").length === 0, "6 dias + folga no domingo: cumpre");
}
{
  // Manhã todos os dias (6h às 14h): 16h de descanso por dia, nunca 24h.
  const manhas: TurnoDaPessoa[] = Array.from({ length: 7 }, (_, i) => ({ data: dia(SEG, i), turno: "MANHA" }));
  const v = conferirEscalaClt(manhas, UMA_SEMANA);
  ok(de(v, "DSR_SEMANAL").length === 1, "Manhã nos 7 dias: 16h por dia não é DSR");
}
{
  // Noite no sábado (termina dom 6h), domingo de folga, segunda Manhã (6h):
  // exatas 24h de descanso — cumpre.
  const turnos: TurnoDaPessoa[] = [
    ...Array.from({ length: 5 }, (_, i) => ({ data: dia(SEG, i), turno: "NOITE" })),
    { data: dia(SEG, 5), turno: "NOITE" },
    { data: dia(SEG, 6), turno: "FOLGA" },
    { data: dia(SEG, 7), turno: "MANHA" },
  ];
  const v = conferirEscalaClt(turnos, UMA_SEMANA);
  ok(de(v, "DSR_SEMANAL").length === 0, "Noite de sábado + folga no domingo + Manhã na segunda: 24h, cumpre");
  ok(de(v, "INTERJORNADA").length === 0, "e sem aviso de interjornada");
}
{
  // Mesma coisa, mas a segunda começa às 5h59: 23h59 de descanso.
  const turnos: TurnoDaPessoa[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ data: dia(SEG, i), turno: "NOITE" })),
    { data: dia(SEG, 7), turno: "OUTRO", inicioMin: 5 * 60 + 59, fimMin: 14 * 60 },
  ];
  const v = conferirEscalaClt(turnos, UMA_SEMANA);
  ok(de(v, "DSR_SEMANAL").length === 1, "23h59 de descanso não fecha as 24h");
}
{
  const v = conferirEscalaClt([], { inicio: SEG, fim: dia(SEG, 27) });
  ok(v.length === 0, "semanas sem nenhum turno na grade: nenhum aviso");
}
{
  // Semana incompleta no período não é avaliada.
  const seteDias: TurnoDaPessoa[] = Array.from({ length: 7 }, (_, i) => ({ data: dia(SEG, i), turno: "INTEGRAL" }));
  const v = conferirEscalaClt(seteDias, { inicio: dia(SEG, 1), fim: dia(SEG, 6) });
  ok(de(v, "DSR_SEMANAL").length === 0, "semana que não cabe inteira no período: fora da conta");
}

console.log("Domingo — 1 folga dominical a cada 7 semanas");
/** N semanas: trabalha de domingo a sexta (Manhã), folga no sábado. */
function semanas(n: number, domingoDeFolga: number[] = []): TurnoDaPessoa[] {
  const turnos: TurnoDaPessoa[] = [];
  for (let s = 0; s < n; s++) {
    for (let d = 0; d < 7; d++) {
      const data = dia(SEG, s * 7 + d);
      const ehDomingo = d === 6;
      const ehSabado = d === 5;
      if (ehSabado || (ehDomingo && domingoDeFolga.includes(s))) turnos.push({ data, turno: "FOLGA" });
      else turnos.push({ data, turno: "MANHA" });
    }
  }
  return turnos;
}
{
  const v = conferirEscalaClt(semanas(6), { inicio: SEG, fim: dia(SEG, 41) });
  ok(de(v, "DOMINGO").length === 0, "6 domingos seguidos trabalhados: ainda sem aviso");
  ok(de(v, "DSR_SEMANAL").length === 0, "(com o sábado de folga, o DSR semanal está cumprido)");
}
{
  const v = conferirEscalaClt(semanas(7), { inicio: SEG, fim: dia(SEG, 48) });
  const dom = de(v, "DOMINGO");
  ok(dom.length === 1, "7º domingo seguido trabalhado: aviso");
  ok(dom[0]?.data === dia(SEG, 48), "o aviso cai no 7º domingo");
}
{
  const v = conferirEscalaClt(semanas(7, [3]), { inicio: SEG, fim: dia(SEG, 48) });
  ok(de(v, "DOMINGO").length === 0, "folga no 4º domingo zera a sequência: sem aviso");
}
{
  const v = conferirEscalaClt(semanas(3), { inicio: SEG, fim: dia(SEG, 20) }, { cicloDomingo: 3 });
  ok(de(v, "DOMINGO").length === 1, "comércio (ciclo de 3, Lei 10.101 art. 6º): aviso no 3º domingo");
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
