import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

// Banco de horas — aviso honesto no lugar do relatório (26/11/2026).
//
// O relatório que morava aqui lia a tabela rh.BancoHoras, que NADA no sistema
// grava: voltava vazio sempre e a tela dizia "Sem dados disponíveis para este
// período", como se o mês estivesse zerado. Saldo de banco de horas mostrado
// errado vira cobrança ou pagamento errado; vazio fingindo estar certo é pior
// que dizer que não existe.
//
// Por que não foi calculado sob demanda (a partir das marcações): faltam as
// regras de que a conta depende, e qualquer número sem elas seria chute —
//  1. Jornada prevista por pessoa. JornadaTrabalho existe, mas nenhum
//     colaborador está ligado a uma (não há jornadaTrabalhoId). O único dado
//     individual é Colaborador.jornadaSemanal, sem a distribuição pelos dias
//     (44h podem ser 8h de segunda a sexta + 4h no sábado, ou 5×8h48).
//  2. Dias que não contam. Feriados (rh.Feriado existe, sem município/UF por
//     empresa ligado ao ponto), férias, atestados e folgas de escala teriam
//     que virar dia sem débito.
//  3. Abono. Aprovar ABONO_ATESTADO/ABONO_FOLGA/CORRECAO no Tratamento só
//     muda o status — não abona nem corrige nada na jornada.
//  4. Compensação e acordo. Não há registro de folga compensada, de acordo de
//     banco de horas (CLT art. 59 §§ 2º, 5º e 6º) nem do prazo de compensação;
//     sem acordo, o excedente é hora extra a pagar, não crédito no banco.
// O mesmo aviso que o portal do colaborador já dá ("em implantação — o sistema
// ainda não apura", app/portal/portal-inicio.tsx).
export function BancoHorasRelatorio({ mesReferencia }: { mesReferencia: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <TrendingUp className="w-4 h-4" />
          Banco de Horas — ainda não calculado pelo sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-amber-900">
        <p>
          O sistema ainda não apura saldo de banco de horas — nem para {mesReferencia}, nem para outro mês.
          Nenhum número aparece aqui para não parecer que o saldo de todos está zerado.
        </p>
        <div>
          <p className="font-medium">O que falta para o cálculo existir:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>ligar cada colaborador à sua jornada contratual (horário de cada dia da semana);</li>
            <li>feriados da cidade de cada empresa, férias, atestados e folgas de escala contando como dia sem débito;</li>
            <li>abono e correção aprovados no Tratamento de ponto mudando a jornada do dia (hoje só mudam o status);</li>
            <li>registro do acordo de banco de horas, das folgas compensadas e do prazo de compensação.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
