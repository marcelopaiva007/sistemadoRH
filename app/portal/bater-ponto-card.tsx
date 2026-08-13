"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, MapPin, ShieldCheck, Camera, CheckCircle2, AlertTriangle } from "lucide-react";
import { registrarPontoPortal, buscarRegistrosPontoHojePortal } from "@/app/actions/portal-ponto";

type TipoBatida = "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";

/** Lado maior da selfie enviada. 640px identifica um rosto e pesa ~60 KB. */
const LADO_MAXIMO_FOTO = 640;

// Reduz a foto da câmera para um JPEG pequeno, como data URL.
//
// A câmera do celular entrega 3–12 MB; subir isso a cada batida estouraria o
// payload da action e o plano do Blob à toa — para conferir QUEM bateu, 640px
// basta. `createImageBitmap` com `imageOrientation` respeita o EXIF: sem isso,
// selfie de iPhone chega deitada.
async function reduzirFoto(arquivo: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    // Foto que não abre não pode impedir a batida — segue sem foto.
    return null;
  }
}

export function BaterPontoCard() {
  const [horaAtual, setHoraAtual] = useState<string>("");
  const [dataAtual, setDataAtual] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  // Batida à espera da selfie: o clique no tipo abre a câmera, e só a foto
  // (ou a escolha explícita de seguir sem ela) registra o ponto.
  const [tipoPendente, setTipoPendente] = useState<TipoBatida | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [sucessoComprovante, setSucessoComprovante] = useState<{
    nsr: number;
    dataHora: string;
    tipo: string;
    hashSHA256: string;
    comFoto?: boolean;
  } | null>(null);

  const [registrosHoje, setRegistrosHoje] = useState<Array<{ id: string; tipo: string; dataHora: Date | string }>>([]);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number; precisao: number } | null>(null);

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

  // Obter localização por GPS no componente
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosicao({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisao: pos.coords.accuracy,
          });
        },
        (err) => {
          console.warn("GPS não capturado:", err.message);
        },
        { enableHighAccuracy: true }
      );
    }
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
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const regs = await buscarRegistrosPontoHojePortal();
        if (ativo) setRegistrosHoje(regs);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

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
    setSucessoComprovante(null);

    try {
      const res = await registrarPontoPortal({
        tipo,
        latitude: posicao?.lat ?? null,
        longitude: posicao?.lng ?? null,
        precisaoGps: posicao?.precisao ?? null,
        fotoBase64,
        dispositivoInfo: typeof window !== "undefined" ? navigator.userAgent : null,
      });

      if (res.erro) {
        setErro(res.erro);
      } else if (res.sucesso && res.comprovante) {
        setSucessoComprovante(res.comprovante);
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
  // ponto por celular existir. Se a câmera falhar ou a pessoa cancelar, o
  // aviso pendente oferece "registrar sem foto": batida NUNCA fica impossível
  // por causa de acessório, mas a linha chega "sem foto" ao painel do RH.
  const iniciarBatida = (tipo: TipoBatida) => {
    setErro(null);
    setSucessoComprovante(null);
    setTipoPendente(tipo);
    inputFotoRef.current?.click();
  };

  const aoEscolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null;
    // Limpa o input para a MESMA foto disparar change de novo na próxima
    // batida — sem isso, tirar duas fotos iguais no dia só registra a primeira.
    e.target.value = "";
    if (!arquivo || !tipoPendente) return;
    const tipo = tipoPendente;
    setTipoPendente(null);
    const fotoBase64 = await reduzirFoto(arquivo);
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
          pessoa cancelou (ou a câmera não abriu), é daqui que ela resolve —
          tentar de novo ou registrar sem foto, com aviso claro do que o RH vê. */}
      {tipoPendente && !loading && (
        <div className="p-3 bg-primary/5 border border-primary/30 rounded-lg space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Camera className="w-4 h-4 text-primary" />
            <span>Falta a foto para registrar: {formatarTipoLabel(tipoPendente)}</span>
          </div>
          <p className="text-muted-foreground">
            A foto mostra ao RH que foi você quem bateu. Sem ela o ponto vale do mesmo jeito,
            mas a batida aparece como &ldquo;sem foto&rdquo; no painel.
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
                const tipo = tipoPendente;
                setTipoPendente(null);
                void handleBaterPonto(tipo, null);
              }}
              className="flex-1 p-2 rounded-md border text-foreground"
            >
              Registrar sem foto
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
      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-3">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span>
            {posicao
              ? `GPS Ativo (${posicao.lat.toFixed(4)}, ${posicao.lng.toFixed(4)})`
              : "Obtendo geolocalização..."}
          </span>
        </div>
        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>REP-P Portaria 671</span>
        </div>
      </div>
    </div>
  );
}
