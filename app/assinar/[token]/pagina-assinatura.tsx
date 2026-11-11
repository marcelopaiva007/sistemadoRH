"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, Download, ExternalLink, FileText, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  validarCpfAssinaturaAction,
  assinarContrachequeAction,
  type DadosReciboPublico,
} from "@/lib/actions/assinatura-contracheque";
import { prepararSelfieParaAssinatura } from "@/app/portal/selfie";

type Etapa = "CPF" | "VISUALIZAR_E_ASSINAR" | "SUCESSO";

export function PaginaAssinaturaClient({
  token,
  dados,
}: {
  token: string;
  dados: Extract<DadosReciboPublico, { encontrado: true }>;
}) {
  const [etapa, setEtapa] = useState<Etapa>(() => {
    if (dados.jaAssinado) return "SUCESSO";
    if (dados.autenticadoSessao) return "VISUALIZAR_E_ASSINAR";
    return "CPF";
  });

  const [bloqueado, setBloqueado] = useState(dados.bloqueado);
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Etapa Assinatura
  const [pdfVisualizado, setPdfVisualizado] = useState(false);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [localizacao, setLocalizacao] = useState<string | null>(null);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(
    dados.comprovanteArquivoId ? `/api/assinar/${token}/comprovante` : null
  );

  const inputFotoRef = useRef<HTMLInputElement>(null);

  // Formatação do CPF
  function formatarCpf(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  // Captura geolocalização opcional
  useEffect(() => {
    if (etapa === "VISUALIZAR_E_ASSINAR" && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocalizacao(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => setLocalizacao(null),
        { timeout: 5000 }
      );
    }
  }, [etapa]);

  function aoValidarCpf(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const res = await validarCpfAssinaturaAction(token, cpf);
      if (res.ok) {
        setEtapa("VISUALIZAR_E_ASSINAR");
      } else {
        if (res.bloqueado) setBloqueado(true);
        setErro(res.error);
      }
    });
  }

  async function aoCapturarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const resFoto = await prepararSelfieParaAssinatura(file);
    if (!resFoto.ok) {
      setFotoDataUrl(null);
      setErro(resFoto.error);
      return;
    }
    setFotoDataUrl(resFoto.dataUrl);
    setErro(null);
  }

  function aoAssinar() {
    if (!fotoDataUrl || !aceite) return;
    setErro(null);
    startTransition(async () => {
      const res = await assinarContrachequeAction(token, {
        fotoDataUrl,
        aceite,
        localizacao,
      });
      if (res.ok) {
        setComprovanteUrl(res.comprovanteUrl);
        setEtapa("SUCESSO");
      } else {
        setErro(res.error);
      }
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 flex flex-col items-center justify-center font-sans antialiased text-slate-900">
      <div className="w-full max-w-lg space-y-6">
        {/* Cabeçalho */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 text-slate-700 text-xs font-medium mb-1">
            <ShieldCheck className="size-3.5 text-blue-600" />
            Ambiente Seguro de Assinatura
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{dados.empresaNome}</h1>
          <p className="text-xs text-slate-500">Contracheque · Competência {dados.competenciaRotulo}</p>
        </div>

        {/* Alerta de Link Bloqueado */}
        {bloqueado ? (
          <Card className="border-red-200 bg-red-50/50 shadow-sm">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto size-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2">
                <ShieldAlert className="size-6" />
              </div>
              <CardTitle className="text-base text-red-900">Link de Acesso Bloqueado</CardTitle>
              <CardDescription className="text-xs text-red-700">
                Por motivos de segurança, este link foi bloqueado após 5 tentativas incorretas consecutivas.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-slate-600 space-y-2">
              <p>Para desbloquear e receber um novo link de assinatura, entre em contato diretamente com o setor de RH da sua empresa.</p>
            </CardContent>
          </Card>
        ) : etapa === "SUCESSO" ? (
          /* Tela de Sucesso */
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm text-center">
            <CardHeader className="pb-3">
              <div className="mx-auto size-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                <CheckCircle2 className="size-8" />
              </div>
              <CardTitle className="text-lg text-emerald-950 font-bold">Contracheque Assinado com Sucesso!</CardTitle>
              <CardDescription className="text-xs text-emerald-800">
                Sua via assinada com a folha de comprovação legal e selfie já está registrada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-slate-600 pt-2">
              <p className="bg-white p-3 rounded border border-emerald-100 text-slate-700">
                Uma cópia completa em PDF foi enviada para o seu e-mail cadastrado para compor seu arquivo pessoal.
              </p>
              {comprovanteUrl && (
                <div className="pt-2">
                  <a
                    href={comprovanteUrl}
                    download
                    className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm transition-colors shadow-sm"
                  >
                    <Download className="size-4" /> Baixar Contracheque Assinado (PDF)
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        ) : etapa === "CPF" ? (
          /* Etapa 1: Desafio de CPF */
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Identificação do Colaborador</CardTitle>
              <CardDescription className="text-xs">
                Olá, {dados.colaboradorPrimeiroNome}. Confirme seu CPF para acessar seu contracheque.
              </CardDescription>
            </CardHeader>
            <form onSubmit={aoValidarCpf}>
              <CardContent className="space-y-4">
                {erro && <p className="p-2.5 text-xs rounded bg-red-50 text-red-700 border border-red-200">{erro}</p>}
                <div className="space-y-1.5">
                  <label htmlFor="cpf" className="text-xs font-medium text-slate-700">
                    Seu CPF
                  </label>
                  <Input
                    id="cpf"
                    type="tel"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(formatarCpf(e.target.value))}
                    className="text-base tracking-wider"
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-400">
                    Digite apenas os números do seu CPF cadastrado na empresa.
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isPending || cpf.replace(/\D/g, "").length !== 11}>
                  {isPending ? "Validando..." : "Acessar contracheque"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        ) : (
          /* Etapa 3: Visualizador PDF + Selfie + Aceite */
          <div className="space-y-5">
            {/* Visualizador de PDF */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="size-4 text-blue-600" /> 1. Confira seu Contracheque
                </CardTitle>
                <CardDescription className="text-xs">
                  Role a página abaixo para ler atentamente todos os vencimentos e descontos.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                <div className="w-full h-[360px] rounded border border-slate-200 bg-slate-100 overflow-hidden relative">
                  <iframe
                    src={`/api/assinar/${token}/pdf#toolbar=0`}
                    className="w-full h-full border-0"
                    title="Contracheque"
                    onLoad={() => setPdfVisualizado(true)}
                  />
                </div>
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="text-[11px] text-slate-500">
                    Não visualizou o contracheque acima?
                  </span>
                  <a
                    href={`/api/assinar/${token}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setPdfVisualizado(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Abrir contracheque em nova aba
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Selfie e Aceite */}
            <Card className={`shadow-sm border-blue-100 transition-opacity ${pdfVisualizado ? "bg-blue-50/20" : "bg-slate-50/50 opacity-90"}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-slate-900">
                  <Camera className="size-4 text-blue-600" /> 2. Selfie e Confirmação de Recebimento
                </CardTitle>
                <CardDescription className="text-xs">
                  Tire uma foto sua para comprovar a autoria da assinatura, igual à batida de ponto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {erro && <p className="p-2.5 text-xs rounded bg-red-50 text-red-700 border border-red-200">{erro}</p>}

                {!pdfVisualizado && (
                  <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    ⚠️ <b>Atenção:</b> Por segurança, confira o contracheque no passo 1 (ou abra em nova aba) para liberar a selfie e a assinatura.
                  </div>
                )}

                {/* Input de Câmera nativo */}
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={aoCapturarFoto}
                  disabled={!pdfVisualizado}
                />

                <div className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 rounded-lg bg-white space-y-3">
                  {fotoDataUrl ? (
                    <div className="flex flex-col items-center space-y-2">
                      <div className="relative size-28 rounded-full overflow-hidden border-2 border-emerald-500 shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoDataUrl} alt="Selfie" className="w-full h-full object-cover" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => inputFotoRef.current?.click()}
                        disabled={!pdfVisualizado}
                        className="text-xs"
                      >
                        <RefreshCw className="size-3 mr-1" /> Tirar outra foto
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => inputFotoRef.current?.click()}
                      disabled={!pdfVisualizado}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 disabled:opacity-50"
                    >
                      <Camera className="size-4" /> Tirar Selfie de Confirmação
                    </Button>
                  )}
                </div>

                {/* Checkbox de Aceite Legal */}
                <div className="flex items-start gap-2.5 pt-1 bg-white p-3 rounded border border-slate-200">
                  <Checkbox
                    id="aceite"
                    checked={aceite}
                    onCheckedChange={(c) => setAceite(c === true)}
                    disabled={!pdfVisualizado}
                    className="mt-0.5"
                  />
                  <label htmlFor="aceite" className="text-xs text-slate-700 font-medium leading-relaxed cursor-pointer">
                    Declaro que recebi o contracheque de <b>{dados.competenciaRotulo}</b> e estou ciente do seu conteúdo.
                  </label>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  onClick={aoAssinar}
                  disabled={isPending || !pdfVisualizado || !fotoDataUrl || !aceite}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 shadow-sm disabled:opacity-50"
                >
                  {isPending ? "Processando e selando documento..." : "Assinar recebimento"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Rodapé institucional */}
        <p className="text-[11px] text-center text-slate-400">
          Assinatura eletrônica simples em conformidade com a MP 2.200-2/2001 e Lei nº 14.063/2020.
        </p>
      </div>
    </div>
  );
}
