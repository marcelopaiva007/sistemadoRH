import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { levantarAvisos, DIAS_ENTRE_AVISOS, montarMensagemDoGestor } from "@/lib/aviso-gestor";

// Prévia dos avisos automáticos ao gestor: exatamente o que o bot mandaria
// AGORA, sem mandar nada.
//
// POR QUE UMA TELA E NÃO UM SCRIPT. A primeira versão disto era um comando de
// terminal (`npm run simular:avisos-gestor`). Quem precisa conferir estas
// mensagens usa o sistema pelo navegador e não tem — nem deveria precisar ter —
// o projeto instalado na máquina. Um recurso que manda mensagem para a chefia
// precisa ser conferível por quem responde por ela.
//
// A tela continua útil DEPOIS de o envio ser ligado: é onde se responde
// "por que fulano recebeu isso?" sem abrir log nenhum.
//
// ESCOPO: `empresasVisiveis` + filtro `?empresas=` da barra lateral — mesmo
// padrão do resto do módulo. O cron roda sem recorte, mas a tela não pode:
// mostraria nome de gente que quem abriu não enxerga.
export default async function AvisosGestorPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const avisos = await levantarAvisos(undefined, undefined, escopo);
  const semCanal = avisos.filter((a) => !a.telegramChatId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Avisos automáticos ao gestor</h1>
        <p className="text-sm text-muted-foreground">
          O que cada gestor receberia por Telegram sobre o time dele — contrato por prazo vencendo,
          férias a vencer e hora extra acima do limite do mês.
        </p>
      </div>

      {/* O aviso mais importante da tela: nada sai daqui. Sem esta frase, quem
          abre a página não tem como saber se está lendo uma prévia ou um
          histórico do que já foi enviado. */}
      <Alert>
        <AlertDescription>
          <strong>Nada é enviado por esta tela nem no momento.</strong> O envio automático está{" "}
          <strong>desligado</strong> — esta é a prévia do que sairia. Quando for ligado, cada gestor
          recebe uma mensagem só, com todos os itens do time dele, e o mesmo assunto sobre a mesma
          pessoa não se repete antes de {DIAS_ENTRE_AVISOS} dias.
        </AlertDescription>
      </Alert>

      {avisos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum gestor tem aviso pendente no momento. Ou não há situação a avisar, ou ninguém está
          marcado como supervisor de outra pessoa na ficha.
        </p>
      ) : (
        <div className="space-y-4">
          {avisos.map((a) => (
            <Card key={a.gestorId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {a.gestorNome}
                  <Badge variant="outline">
                    {a.itens.length} {a.itens.length === 1 ? "aviso" : "avisos"}
                  </Badge>
                  {/* Não é detalhe técnico: gestor sem Telegram simplesmente
                      não recebe, e quem lê esta tela precisa saber disso para
                      cobrar o vínculo — senão o silêncio parece "está tudo bem". */}
                  {!a.telegramChatId && <Badge variant="destructive">Sem Telegram</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* A mensagem literal, e não uma lista remontada: é ela que a
                    pessoa vai ler no celular, com as quebras de linha e tudo. */}
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {montarMensagemDoGestor(a.gestorNome, a.itens)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {semCanal.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {semCanal.length} gestor(es) não receberiam nada por não ter Telegram vinculado. Eles
          continuam na pendência &ldquo;Sem Telegram vinculado&rdquo; da tela inicial.
        </p>
      )}
    </div>
  );
}
