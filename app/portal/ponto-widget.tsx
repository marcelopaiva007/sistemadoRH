"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registrarPonto, type RegistroPontoInput } from "@/lib/actions/portal-ponto";

type PontoRecord = {
  id: string;
  tipo: string;
  dataHora: Date;
  dentro_janela: boolean;
  localizacao: string | null;
};

export function PontoWidget({ pontos: pontosinicial = [] }: { pontos?: PontoRecord[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mostrando, setMostrando] = useState<"menu" | "camera" | "foto">("menu");
  const [tipo, setTipo] = useState<"ENTRADA" | "SAÍDA">("ENTRADA");
  const [localizacao, setLocalizacao] = useState<{ lat: number; lon: number } | null>(null);
  const [fotoBlobUrl, setFotoBlobUrl] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();
  const [pontos, setPontos] = useState(pontosinicial);

  async function iniciarCamera() {
    setMostrando("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error("Câmera não disponível");
      setMostrando("menu");
    }
  }

  function capturarFoto() {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);

        canvasRef.current.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setFotoBlobUrl(url);
            const reader = new FileReader();
            reader.onload = (e) => {
              setFotoBase64((e.target?.result as string) || "");
            };
            reader.readAsDataURL(blob);
          }
        });

        // Parar o stream
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());

        setMostrando("foto");
      }
    }
  }

  function selecionarFotoArquivo() {
    fileInputRef.current?.click();
  }

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (arquivo) {
      const url = URL.createObjectURL(arquivo);
      setFotoBlobUrl(url);
      const reader = new FileReader();
      reader.onload = (evt) => {
        setFotoBase64((evt.target?.result as string) || "");
      };
      reader.readAsDataURL(arquivo);
      setMostrando("foto");
    }
  }

  async function obterLocalizacao(): Promise<{ lat: number; lon: number } | null> {
    return new Promise((resolve) => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            });
            setLocalizacao({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            });
          },
          () => {
            toast.warning("Localização não disponível");
            resolve(null);
          }
        );
      } else {
        resolve(null);
      }
    });
  }

  async function confirmarPonto() {
    if (!fotoBase64 || !localizacao) {
      toast.error("Foto e localização são obrigatórias");
      return;
    }

    iniciarTransicao(async () => {
      const resultado = await registrarPonto({
        tipo,
        selfieBase64: fotoBase64,
        latitude: localizacao.lat,
        longitude: localizacao.lon,
        localizacao: `${localizacao.lat.toFixed(4)}, ${localizacao.lon.toFixed(4)}`,
      } as RegistroPontoInput);

      if (resultado.ok && resultado.ponto) {
        toast.success(`${tipo === "ENTRADA" ? "Entrada" : "Saída"} registrada com sucesso!`);
        setPontos([resultado.ponto, ...pontos]);
        resetarFormulario();
      } else {
        toast.error(resultado.error);
      }
    });
  }

  function resetarFormulario() {
    setMostrando("menu");
    setFotoBlobUrl(null);
    setFotoBase64(null);
    setLocalizacao(null);
  }

  if (mostrando === "camera") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Câmera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg bg-black"
          />
          <div className="flex gap-2">
            <Button onClick={capturarFoto} className="flex-1" size="lg">
              <Camera className="mr-2 size-4" />
              Capturar
            </Button>
            <Button variant="outline" onClick={() => setMostrando("menu")}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mostrando === "foto") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tipo === "ENTRADA" ? "Entrada" : "Saída"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fotoBlobUrl && (
            <Image
              src={fotoBlobUrl}
              alt="Selfie"
              width={400}
              height={600}
              className="w-full rounded-lg"
            />
          )}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              <span>
                {localizacao
                  ? `${localizacao.lat.toFixed(4)}, ${localizacao.lon.toFixed(4)}`
                  : "Obtendo localização..."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <span>{new Date().toLocaleTimeString("pt-BR")}</span>
            </div>
          </div>
          <Button
            onClick={confirmarPonto}
            disabled={pendente || !localizacao}
            className="w-full"
            size="lg"
          >
            {pendente ? "Registrando..." : `Confirmar ${tipo === "ENTRADA" ? "Entrada" : "Saída"}`}
          </Button>
          <Button variant="outline" onClick={resetarFormulario} className="w-full">
            Recomeçar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bater Ponto</CardTitle>
          <CardDescription>Registre sua entrada ou saída com foto e localização</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                setTipo("ENTRADA");
                await obterLocalizacao();
                iniciarCamera();
              }}
              size="lg"
              className="bg-green-600 hover:bg-green-700"
            >
              <Clock className="mr-2 size-4" />
              Entrada
            </Button>
            <Button
              onClick={async () => {
                setTipo("SAÍDA");
                await obterLocalizacao();
                iniciarCamera();
              }}
              size="lg"
              className="bg-red-600 hover:bg-red-700"
            >
              <Clock className="mr-2 size-4" />
              Saída
            </Button>
          </div>
          <Button
            onClick={selecionarFotoArquivo}
            variant="outline"
            className="w-full"
            disabled={true} // Desabilitar por enquanto - pode habilitar depois
          >
            Usar foto do celular
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleArquivoSelecionado}
            className="hidden"
          />
        </CardContent>
      </Card>

      {pontos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pontos.map((ponto) => (
                <div
                  key={ponto.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {ponto.tipo === "ENTRADA" ? "✓ Entrada" : "✗ Saída"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ponto.dataHora).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      ponto.dentro_janela
                        ? "text-green-600"
                        : "text-yellow-600"
                    }`}
                  >
                    {ponto.dentro_janela ? "No horário" : "Fora da janela"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
