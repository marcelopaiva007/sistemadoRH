"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, MapPin, ShieldCheck, Camera, CheckCircle2, AlertTriangle } from "lucide-react";
import { registrarPontoPortal, buscarRegistrosPontoHojePortal } from "@/app/actions/portal-ponto";

type TipoBatida = "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";

/** Lado maior da selfie enviada. 640px identifica um rosto e pesa ~60 KB. */
const LADO_MAXIMO_FOTO = 640;

// Decodifica o arquivo da câmera, do caminho mais completo ao mais
// compatível. Três degraus, e a ORDEM é o ponto: com a foto obrigatória
// (20/08/2026), decodificação que falha = pessoa sem conseguir bater o ponto
// — e a revisão do mesmo dia mostrou dois aparelhos onde o degrau 1 falha
// SEMPRE, não às vezes:
//
// 1. createImageBitmap com imageOrientation respeita o EXIF (selfie de iPhone
//    chega em pé). Mas o valor "from-image" só existe no Chrome 108+ — de 81
//    a 107 (Android antigo, público típico de bater ponto no celular) a opção
//    é conhecida e o VALOR é rejeitado com TypeError antes de decodificar.
// 2. createImageBitmap sem opções cobre esses Chromes. A foto pode chegar
//    deitada neles; deitada registra e identifica — sem foto, não registra.
// 3. <img> + object URL cobre navegador sem createImageBitmap nenhum
//    (Safari de iOS <= 14). O <img> aplica o EXIF sozinho nos iOS modernos.
async function decodificarFoto(arquivo: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    /* degrau 2 */
  }
  try {
    return await createImageBitmap(arquivo);
  } catch {
    /* degrau 3 */
  }
  try {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("imagem não decodificou"));
        img.src = url;
      });
      return img;
    } finally {
      // Depois do onload o navegador já decodificou; revogar aqui não
      // atrapalha o drawImage e não vaza a URL se o load falhar.
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

// Reduz a foto da câmera para um JPEG pequeno, como data URL.
//
// A câmera do celular entrega 3–12 MB; subir isso a cada batida estouraria o
// payload da action e o plano do Blob à toa — para conferir QUEM bateu, 640px
// basta.
async function reduzirFoto(arquivo: File): Promise<string | null> {
  const imagem = await decodificarFoto(arquivo);
  if (!imagem) return null;
  try {
    const larguraOriginal = imagem instanceof HTMLImageElement ? imagem.naturalWidth : imagem.width;
    const alturaOriginal = imagem instanceof HTMLImageElement ? imagem.naturalHeight : imagem.height;
    if (!larguraOriginal || !alturaOriginal) return null;
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(larguraOriginal, alturaOriginal));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(larguraOriginal * escala);
    canvas.height = Math.round(alturaOriginal * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    if ("close" in imagem) imagem.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    // Decodificou mas não reduziu: devolve null e quem chamou orienta a
    // pessoa — desde 20/08/2026 a batida não segue sem foto.
    return null;
  }
}

export function BaterPontoCard() {
  const [horaAtual, setHoraAtual] = useState<string>("");
  const [dataAtual, setDataAtual] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  // Batida à espera da selfie: o clique no tipo abre a câmera, e só a foto
  // registra o ponto (obrigatória desde 20/08/2026).
  const [tipoPendente, setTipoPendente] = useState<TipoBatida | null>(null);
  // O MESMO valor num ref, para o fluxo da foto reconferir DEPOIS do await:
  // reduzir uma foto de 12 MP leva segundos em aparelho fraco, e sem a
  // reconferência um "Cancelar" tocado nessa janela não cancelava — a batida
  // registrava mesmo assim, em registro REP-P que não se desfaz.
  const tipoPendenteRef = useRef<TipoBatida | null>(null);
  const mudarTipoPendente = (tipo: TipoBatida | null) => {
    tipoPendenteRef.current = tipo;
    setTipoPendente(tipo);
  };
  const inputFotoRef = useRef<HTMLInputElement>(null);
  // Aviso do teto de estágio. Separado do erro DE PROPÓSITO: a marcação foi
  // registrada: ver avisoDeLimiteEstagio em lib/ponto-regras.ts.
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucessoComprovante, setSucessoComprovante] = useState<{
    nsr: number;
    dataHora: string;
    tipo: string;
    hashSHA256: string;
    comFoto?: boolean;
  } | null>(null);

  const [registrosHoje, setRegistrosHoje] = useState<Array<{ id: string; tipo: string; dataHora: Date | string }>>([]);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number; precisao: number } | null>(null);
  // GPS que falhou é estado de tela, não console.warn: com a cerca de
  // localização ligada, sem GPS o servidor RECUSA a batida — a pessoa precisa
  // ver o problema (e o botão de tentar de novo) ANTES de tirar a selfie.
  const [gpsErro, setGpsErro] = useState<string | null>(null);

  // Relógio em tempo real (Horário de Brasília)
  useEffect(() => {
    const atualizarRelogio = () => {
      const agora = new Date();
      setHoraAtual(agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      setDataAtual(
        agora.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "America/Sao_Paulo",
        })
      );
    };

    atualizarRelogio();
    const interval = setInterval(atualizarRelogio, 1000);
    return () => clearInterval(interval);
  }, []);

  // UMA leitura de GPS, com timeout: getCurrentPosition sem timeout pode
  // simplesmente nunca responder (Android com localização "só ao usar" e a
  // tela apagando), e a promessa pendurada travaria a batida para sempre.
  // Nunca rejeita — falha vira null e quem chamou decide o que fazer.
  const lerPosicao = (maximumAgeMs: number) =>
    new Promise<{ lat: number; lng: number; precisao: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao: pos.coords.accuracy,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: maximumAgeMs }
      );
    });

  const capturarPosicao = async (maximumAgeMs: number) => {
    const pos = await lerPosicao(maximumAgeMs);
    if (pos) {
      setPosicao(pos);
      setGpsErro(null);
    } else {
      setGpsErro(
        "Não foi possível obter sua localização. Verifique se o GPS está ativado e se este site tem permissão de localização."
      );
    }
    return pos;
  };

  // Obter localização por GPS ao abrir a tela. maximumAge de 1 min: leitura
  // recente do próprio aparelho serve e aparece na hora. Mesma forma do efeito
  // das batidas logo abaixo — função async interna com guarda de "ainda
  // montado", para o setState nunca rodar num componente que já saiu de cena.
  useEffect(() => {
    let ativo = true;
    const capturar = async () => {
      const pos = await lerPosicao(60_000);
      if (!ativo) return;
      if (pos) {
        setPosicao(pos);
        setGpsErro(null);
      } else {
        setGpsErro(
          "Não foi possível obter sua localização. Verifique se o GPS está ativado e se este site tem permissão de localização."
        );
      }
    };
    void capturar();
    return () => {
      ativo = false;
    };
  }, []);

  // Carregar batidas de hoje
  const carregarRegistrosHoje = async () => {
    try {
      const regs = await buscarRegistrosPontoHojePortal();
      setRegistrosHoje(regs);
    } catch (e) {
      console.error(e);
    }
  };

  // Busca de dados em efeito, com guarda de "ainda montado".
  //
  // Era `useEffect(() => { carregarRegistrosHoje(); }, [])`. Além de o eslint
  // acusar setState em efeito, havia um problema real: quem abre o portal e sai
  // da tela antes de a resposta chegar recebia um `setState` num componente que
  // já não existe. A flag `ativo` corta isso.
  //
  // A dependência é `dataAtual` (a data de Brasília do relógio acima), não []:
  // no celular a aba/PWA fica aberta e, na virada do dia, a lista de ontem
  // deixava os 4 botões travados em "Registrado" — a pessoa não conseguia
  // bater o ponto do dia novo sem dar reload. Quando a data vira, recarrega.
  // O listener de visibilitychange cobre o caso irmão: app que volta do
  // segundo plano horas depois pega a lista fresca em vez da congelada.
  useEffect(() => {
    if (!dataAtual) return;
    let ativo = true;
    const buscar = async () => {
      try {
        const regs = await buscarRegistrosPontoHojePortal();
        if (ativo) setRegistrosHoje(regs);
      } catch (e) {
        console.error(e);
      }
    };
    void buscar();
    const aoVoltarParaATela = () => {
      if (document.visibilityState === "visible") void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltarParaATela);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", aoVoltarParaATela);
    };
  }, [dataAtual]);

  // Determinar próximo tipo de batida sugerido
  const sugerirProximoTipo = (): "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2" => {
    if (registrosHoje.length === 0) return "ENTRADA_1";
    if (registrosHoje.length === 1) return "SAIDA_1";
    if (registrosHoje.length === 2) return "ENTRADA_2";
    return "SAIDA_2";
  };

  const handleBaterPonto = async (tipo: TipoBatida, fotoBase64: string | null) => {
    setLoading(true);
    setErro(null);
    setAviso(null);
    setSucessoComprovante(null);

    // Posição FRESCA na hora da batida, não a do mount: num PWA que ficou
    // aberto, a posição capturada ao abrir pode ter horas — de outro lugar da
    // cidade. Com a cerca de localização, isso recusaria batida de quem está
    // na empresa (ou aceitaria a de quem não está). maximumAge de 30 s;
    // se a leitura nova falhar, a última conhecida ainda é melhor que nada.
    const posicaoDaBatida = (await lerPosicao(30_000)) ?? posicao;
    if (posicaoDaBatida && posicaoDaBatida !== posicao) setPosicao(posicaoDaBatida);

    try {
      const res = await registrarPontoPortal({
        tipo,
        latitude: posicaoDaBatida?.lat ?? null,
        longitude: posicaoDaBatida?.lng ?? null,
        precisaoGps: posicaoDaBatida?.precisao ?? null,
        fotoBase64,
        dispositivoInfo: typeof window !== "undefined" ? navigator.userAgent : null,
      });

      if (res.erro) {
        setErro(res.erro);
        // Recarrega a lista TAMBÉM no erro. O caso que dói: rede caiu depois
        // de o servidor gravar — a retentativa volta "Você já registrou X
        // hoje", e sem recarregar o botão do tipo continuava habilitado e sem
        // o selo "Registrado": a pessoa repetia selfie e erro até dar F5,
        // achando que o ponto dela não existia.
        await carregarRegistrosHoje();
      } else if (res.sucesso && res.comprovante) {
        setSucessoComprovante(res.comprovante);
        setAviso(res.aviso ?? null);
        await carregarRegistrosHoje();
      }
    } catch {
      setErro("Falha de conexão ao registrar ponto. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Clique no tipo NÃO registra: abre a câmera e deixa a batida pendente. É a
  // foto que confirma — quem bate é identificado no ato, que é o motivo de o
  // ponto por celular existir. Desde 20/08/2026 a foto é OBRIGATÓRIA (pedido
  // do RH: confirmar identidade e local da batida): se a câmera falhar ou a
  // pessoa cancelar, o aviso pendente oferece tentar de novo — sem foto não
  // registra, e a MESMA regra vale no servidor (registrarPontoPortal recusa),
  // porque esconder o botão aqui não fecha o endpoint.
  const iniciarBatida = (tipo: TipoBatida) => {
    setErro(null);
    setAviso(null);
    setSucessoComprovante(null);
    mudarTipoPendente(tipo);
    inputFotoRef.current?.click();
  };

  const aoEscolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null;
    // Limpa o input para a MESMA foto disparar change de novo na próxima
    // batida — sem isso, tirar duas fotos iguais no dia só registra a primeira.
    e.target.value = "";
    if (!arquivo || !tipoPendente) return;
    const tipo = tipoPendente;
    // `loading` já durante a REDUÇÃO da foto, não só no envio: a redução leva
    // segundos em aparelho fraco, e com a tela viva nessa janela o Cancelar e
    // os outros tipos ficavam clicáveis — cancelamento que não cancelava e
    // troca de tipo que descartava a selfie em silêncio.
    setLoading(true);
    const fotoBase64 = await reduzirFoto(arquivo);
    // Reconfere DEPOIS do await (pelo ref, que o estado deste render não vê):
    // se algo desarmou ou trocou a batida nesse meio-tempo, esta foto morre
    // aqui — nada registra por baixo de um cancelamento.
    if (tipoPendenteRef.current !== tipo) {
      setLoading(false);
      return;
    }
    if (!fotoBase64) {
      // Foto que não abriu não registra (obrigatória desde 20/08/2026): a
      // batida continua pendente. A mensagem aponta a saída de quem cai aqui
      // TODA vez — aparelho cujo navegador não decodifica a foto — porque
      // para essa pessoa "tire outra" sozinho é um beco: nenhuma foto vai
      // funcionar, e o caminho é o RH registrar a marcação manualmente.
      setLoading(false);
      setErro(
        "Não foi possível ler a foto neste aparelho. Tente de novo — e, se continuar falhando, avise o RH para registrar sua marcação manualmente.",
      );
      return;
    }
    mudarTipoPendente(null);
    await handleBaterPonto(tipo, fotoBase64);
  };

  const formatarTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "ENTRADA_1":
        return "1ª Entrada";
      case "SAIDA_1":
        return "1ª Saída (Almoço)";
      case "ENTRADA_2":
        return "2ª Entrada (Retorno)";
      case "SAIDA_2":
        return "2ª Saída (Fim de Turno)";
      default:
        return tipo;
    }
  };

  return (
    <div className="bg-card text-card-foreground border rounded-xl p-5 shadow-xs space-y-4">
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-base leading-tight">Ponto Eletrônico REP-P</h2>
            <p className="text-xs text-muted-foreground capitalize">{dataAtual}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-extrabold tracking-tight text-foreground font-mono">{horaAtual}</span>
          <p className="text-[10px] text-muted-foreground">Horário Oficial de Brasília</p>
        </div>
      </div>

      {/* Alerta de erro */}
      {erro && (
        <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-lg text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Input escondido que abre a câmera frontal. `capture="user"` chama a
          câmera do próprio aparelho — sem pedir permissão de getUserMedia nem
          depender de preview embutido, que falha em navegador antigo. */}
      <input
        ref={inputFotoRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={aoEscolherFoto}
      />

      {/* Batida à espera da foto: aparece quando a câmera foi aberta. Se a
          pessoa cancelou (ou a câmera não abriu), é daqui que ela tenta de
          novo. "Registrar sem foto" saiu em 20/08/2026 — a foto virou
          obrigatória (confirma identidade e local), e o servidor recusa
          batida sem ela. Cancelar só desarma a batida pendente. */}
      {tipoPendente && !loading && (
        <div className="p-3 bg-primary/5 border border-primary/30 rounded-lg space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Camera className="w-4 h-4 text-primary" />
            <span>Falta a foto para registrar: {formatarTipoLabel(tipoPendente)}</span>
          </div>
          <p className="text-muted-foreground">
            A foto é obrigatória: ela confirma que foi você quem bateu e de onde. Sem a foto o
            ponto não é registrado.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => inputFotoRef.current?.click()}
              className="flex-1 p-2 rounded-md bg-primary text-primary-foreground font-medium"
            >
              Tirar a foto
            </button>
            <button
              onClick={() => {
                // Desarma a batida E limpa o erro de foto ilegível: sem isso,
                // o aviso "tire outra foto" ficava órfão na tela depois de
                // cancelar, instruindo uma ação que não levava a nada.
                mudarTipoPendente(null);
                setErro(null);
              }}
              className="flex-1 p-2 rounded-md border text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Comprovante Eletrônico Instantâneo (REP-P / Portaria MTP 671) */}
      {sucessoComprovante && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Ponto Registrado com Sucesso! (Comprovante REP-P)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
            <div>
              <span className="font-medium text-foreground">NSR:</span> #{sucessoComprovante.nsr}
            </div>
            <div>
              <span className="font-medium text-foreground">Tipo:</span> {formatarTipoLabel(sucessoComprovante.tipo)}
            </div>
            <div className="col-span-2">
              <span className="font-medium text-foreground">Data/Hora:</span>{" "}
              {new Date(sucessoComprovante.dataHora).toLocaleString("pt-BR")}
            </div>
            <div className="col-span-2 truncate font-mono text-[10px]">
              <span className="font-medium text-foreground font-sans">Hash SHA-256:</span>{" "}
              {sucessoComprovante.hashSHA256}
            </div>
            <div className="col-span-2 flex items-center gap-1">
              <Camera className="w-3 h-3" />
              <span>{sucessoComprovante.comFoto ? "Foto anexada ao registro" : "Registrado sem foto"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Teto de jornada do estagiário. Fica ABAIXO do comprovante, em âmbar e
          não em vermelho: a marcação valeu, e o que precisa de ação é a
          jornada — conversa com o supervisor, não com o sistema. */}
      {aviso && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs">
          <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
            <span>{aviso}</span>
          </p>
        </div>
      )}

      {/* Botões de Ação Dinâmicos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(["ENTRADA_1", "SAIDA_1", "ENTRADA_2", "SAIDA_2"] as const).map((tipo) => {
          const jaBatido = registrosHoje.some((r) => r.tipo === tipo);
          const eSugerido = sugerirProximoTipo() === tipo;

          return (
            <button
              key={tipo}
              disabled={loading || jaBatido}
              onClick={() => iniciarBatida(tipo)}
              className={`p-2.5 rounded-lg border text-xs font-medium transition-all flex flex-col items-center justify-center gap-1 ${
                jaBatido
                  ? "bg-muted/40 border-muted text-muted-foreground cursor-not-allowed opacity-60"
                  : eSugerido
                  ? "bg-primary text-primary-foreground border-primary shadow-xs hover:bg-primary/90"
                  : "bg-background border-border text-foreground hover:bg-accent"
              }`}
            >
              <span>{formatarTipoLabel(tipo)}</span>
              {jaBatido ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Registrado
                </span>
              ) : (
                <span className="text-[10px] opacity-80 flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Tirar foto e registrar
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status de Segurança e Geolocalização */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-t pt-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className={`w-3.5 h-3.5 shrink-0 ${gpsErro && !posicao ? "text-destructive" : "text-primary"}`} />
          {posicao ? (
            <span>GPS Ativo ({posicao.lat.toFixed(4)}, {posicao.lng.toFixed(4)})</span>
          ) : gpsErro ? (
            // Sem posição E com erro: a batida pode ser recusada pela cerca de
            // localização. O caminho de volta fica no próprio rodapé.
            <span className="text-destructive">
              GPS indisponível.{" "}
              <button type="button" className="underline font-medium" onClick={() => void capturarPosicao(0)}>
                Tentar de novo
              </button>
            </span>
          ) : (
            <span>Obtendo geolocalização...</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>REP-P Portaria 671</span>
        </div>
      </div>
      {gpsErro && !posicao && (
        <p className="text-[11px] text-muted-foreground -mt-2">{gpsErro}</p>
      )}
    </div>
  );
}
