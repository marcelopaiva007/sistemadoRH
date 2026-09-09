import { headers } from "next/headers";
import { ipDaRequisicao } from "@/lib/login-tentativas";
import { prisma } from "@/lib/prisma";
import { limitesDeEstagio } from "@/lib/ponto-regras";
import { ConfiguracoesPontoView } from "../configuracoes-view";

/**
 * Configurações do ponto da empresa: limite de estágio, cerca de GPS e trava
 * de IP. Era a aba "Configurações"; virou página em v1.170.0.
 */
export default async function PontoConfiguracoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // O IP público de QUEM ABRIU esta tela — mesma extração da batida em
  // registrarPontoPortal. O RH está na rede da empresa, então este é
  // exatamente o IP fixo que ele quer autorizar, sem precisar descobrir em
  // site de "qual é meu IP".
  const headersList = await headers();
  // "desconhecido" vira null de propósito: o botão "adicionar meu IP" grava o
  // texto cru na lista de autorizados, e a palavra "desconhecido" lá dentro
  // autorizaria justamente as requisições cujo IP o servidor não conseguiu
  // determinar. Sem IP legível, a tela não oferece o atalho — o RH digita o IP
  // fixo à mão.
  const ipBruto = ipDaRequisicao(headersList);
  const ipAtual = ipBruto === "desconhecido" ? null : ipBruto;

  // Pode não existir: a linha nasce quando alguém salva esta tela pela
  // primeira vez.
  const configPonto = await prisma.configuracaoPontoEmpresa.findUnique({
    where: { empresaId },
  });

  // Truncado no teto legal aqui também — a tela nunca mostra um número que a
  // apuração não vá aplicar (ver limitesDeEstagio).
  const limitesEstagio = limitesDeEstagio(configPonto);

  return (
    <ConfiguracoesPontoView
      empresaId={empresaId}
      minutosDia={limitesEstagio.dia}
      minutosSemana={limitesEstagio.semana}
      geofencing={{
        latitude: configPonto?.latitudeEmpresa ?? null,
        longitude: configPonto?.longitudeEmpresa ?? null,
        raioMetros: configPonto?.raioPermitidoMtrs ?? 200,
        // A tela mostra o que REALMENTE bloqueia, não o que a coluna diz.
        // registrarPontoPortal exige GPS quando `exigirGps` é true E há cerca
        // cadastrada — então nos dois casos em que não há cerca (sem linha de
        // configuração, ou linha com `exigirGps` true e coordenada nula,
        // herdada do default antigo) a caixa aparece DESMARCADA, porque nada
        // está sendo bloqueado. Mostrá-la marcada com os campos de coordenada
        // vazios faria a tela mentir: o RH leria "estou bloqueando" e não
        // estaria. Salvar a partir daí grava exigirGps=false e limpa a herança.
        exigirGps:
          (configPonto?.exigirGps ?? false) &&
          configPonto?.latitudeEmpresa != null &&
          configPonto?.longitudeEmpresa != null,
      }}
      travaIp={{
        ipsAutorizados: configPonto?.ipsAutorizados ?? "",
        exigirIp: configPonto?.exigirIp ?? false,
        ipAtual,
      }}
    />
  );
}
