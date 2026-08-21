"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, LocateFixed, MapPin, Network } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarGeofencingPonto, salvarLimiteEstagio, salvarTravaIpPonto } from "@/app/actions/rh-ponto";
import { TETO_LEGAL_ESTAGIO_MIN_DIA, TETO_LEGAL_ESTAGIO_MIN_SEMANA } from "@/lib/ponto-regras";

/**
 * Configurações de ponto da empresa — hoje só o teto de jornada do estagiário.
 *
 * POR QUE EM HORAS E NÃO EM MINUTOS. A coluna guarda minutos porque a apuração
 * trabalha em minutos, mas quem preenche pensa em "6 horas por dia". Pedir 360
 * aqui seria empurrar a unidade do banco para a tela.
 *
 * Os limites da lei aparecem escritos ao lado do campo, e não só na mensagem de
 * erro: quem está preenchendo precisa saber a régua ANTES de tentar, não depois
 * de levar uma recusa.
 */
export function ConfiguracoesPontoView({
  empresaId,
  minutosDia,
  minutosSemana,
  geofencing,
  travaIp,
}: {
  empresaId: string;
  minutosDia: number;
  minutosSemana: number;
  geofencing: {
    latitude: number | null;
    longitude: number | null;
    raioMetros: number;
    exigirGps: boolean;
  };
  travaIp: {
    ipsAutorizados: string;
    exigirIp: boolean;
    /** IP público de quem abriu a tela — na rede da empresa, é o IP fixo a autorizar. */
    ipAtual: string | null;
  };
}) {
  const router = useRouter();
  const [horasDia, setHorasDia] = useState(String(minutosDia / 60));
  const [horasSemana, setHorasSemana] = useState(String(minutosSemana / 60));
  const [salvando, setSalvando] = useState(false);

  // Cerca de localização do ponto. Strings, não números: campo de coordenada
  // fica vazio quando não há cerca, e "" não é 0 (0 é um lugar de verdade).
  const [latitude, setLatitude] = useState(geofencing.latitude === null ? "" : String(geofencing.latitude));
  const [longitude, setLongitude] = useState(geofencing.longitude === null ? "" : String(geofencing.longitude));
  const [raio, setRaio] = useState(String(geofencing.raioMetros));
  const [exigirGps, setExigirGps] = useState(geofencing.exigirGps);
  const [salvandoCerca, setSalvandoCerca] = useState(false);
  const [pegandoLocal, setPegandoLocal] = useState(false);

  // Preenche as coordenadas com a posição de quem está usando a tela — o
  // jeito prático de cadastrar a sede é o RH abrir esta aba DE DENTRO da
  // empresa e clicar aqui, em vez de caçar coordenada em site de mapa.
  function usarLocalizacaoAtual() {
    if (!("geolocation" in navigator)) {
      toast.error("Este navegador não dá acesso à localização.");
      return;
    }
    setPegandoLocal(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setPegandoLocal(false);
        toast.success(`Localização capturada (precisão de ~${Math.round(pos.coords.accuracy)} m).`);
      },
      () => {
        setPegandoLocal(false);
        toast.error("Não foi possível obter a localização. Verifique a permissão do navegador.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Trava de IP: a rede fixa da empresa como condição para bater ponto.
  const [ips, setIps] = useState(travaIp.ipsAutorizados);
  const [exigirIp, setExigirIp] = useState(travaIp.exigirIp);
  const [salvandoIp, setSalvandoIp] = useState(false);

  function usarMeuIp() {
    if (!travaIp.ipAtual) return;
    const lista = ips
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip !== "");
    if (lista.includes(travaIp.ipAtual)) {
      toast.info("Este IP já está na lista.");
      return;
    }
    setIps([...lista, travaIp.ipAtual].join(", "));
  }

  async function salvarIp() {
    setSalvandoIp(true);
    const r = await salvarTravaIpPonto({ empresaId, ipsAutorizados: ips, exigirIp });
    setSalvandoIp(false);

    if (r.ok) {
      toast.success(
        ips.trim() === ""
          ? "Trava de IP removida."
          : exigirIp
            ? "Trava de IP salva. Batidas fora da rede autorizada serão recusadas."
            : "IPs salvos, sem bloqueio (só registra se a batida veio de fora da rede)."
      );
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function salvarCerca() {
    const latTexto = latitude.trim().replace(",", ".");
    const lngTexto = longitude.trim().replace(",", ".");
    const lat = latTexto === "" ? null : Number(latTexto);
    const lng = lngTexto === "" ? null : Number(lngTexto);
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      toast.error("Latitude e longitude devem ser números (ex.: -23.550520).");
      return;
    }
    const raioNum = Number(String(raio).trim());
    if (!Number.isFinite(raioNum)) {
      toast.error("Informe o raio em metros.");
      return;
    }

    setSalvandoCerca(true);
    const r = await salvarGeofencingPonto({
      empresaId,
      latitudeEmpresa: lat,
      longitudeEmpresa: lng,
      raioPermitidoMtrs: Math.round(raioNum),
      exigirGps,
    });
    setSalvandoCerca(false);

    if (r.ok) {
      toast.success(
        lat === null
          ? "Cerca de localização removida."
          : exigirGps
            ? "Cerca de localização salva. Batidas fora do raio serão recusadas."
            : "Cerca de localização salva, sem bloqueio (só registra se a batida saiu do raio)."
      );
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  const tetoDia = TETO_LEGAL_ESTAGIO_MIN_DIA / 60;
  const tetoSemana = TETO_LEGAL_ESTAGIO_MIN_SEMANA / 60;

  async function salvar() {
    const dia = Number(String(horasDia).replace(",", "."));
    const semana = Number(String(horasSemana).replace(",", "."));
    if (!Number.isFinite(dia) || !Number.isFinite(semana)) {
      toast.error("Informe as horas em número.");
      return;
    }

    setSalvando(true);
    const r = await salvarLimiteEstagio({
      empresaId,
      minutosDia: Math.round(dia * 60),
      minutosSemana: Math.round(semana * 60),
    });
    setSalvando(false);

    if (r.ok) {
      toast.success("Limite de estágio salvo.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Configurações do Ponto</h2>
        <p className="text-xs text-muted-foreground">
          Regras que valem para todos os colaboradores desta empresa.
        </p>
      </div>

      <Card className="border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            Localização permitida (cerca de GPS)
          </CardTitle>
          <CardDescription className="text-xs">
            Com a cerca ativada, o colaborador só consegue registrar o ponto quando o celular
            estiver dentro do raio em torno da empresa. Fora do raio, a batida é{" "}
            <strong>recusada na hora</strong>, com a distância na mensagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="latitudeEmpresa">Latitude</Label>
              <Input
                id="latitudeEmpresa"
                inputMode="decimal"
                placeholder="-23.550520"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="longitudeEmpresa">Longitude</Label>
              <Input
                id="longitudeEmpresa"
                inputMode="decimal"
                placeholder="-46.633308"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raioPermitido">Raio permitido (metros)</Label>
              <Input
                id="raioPermitido"
                type="number"
                min={50}
                max={10000}
                step={10}
                value={raio}
                onChange={(e) => setRaio(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 50 m — o GPS do celular erra dezenas de metros mesmo parado.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={usarLocalizacaoAtual}
              disabled={pegandoLocal}
            >
              <LocateFixed className="size-4 mr-1" />
              {pegandoLocal ? "Obtendo…" : "Usar minha localização atual"}
            </Button>
            {latitude.trim() !== "" && longitude.trim() !== "" && (
              <a
                className="text-xs underline text-muted-foreground"
                href={`https://www.google.com/maps?q=${latitude.trim().replace(",", ".")},${longitude.trim().replace(",", ".")}`}
                target="_blank"
                rel="noreferrer"
              >
                Conferir no mapa
              </a>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={exigirGps}
              onCheckedChange={(v) => setExigirGps(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Bloquear batida fora do raio</span>
              <span className="block text-xs text-muted-foreground">
                Também torna o GPS obrigatório: sem localização ativa, o ponto não registra.
                Desmarcado, a batida fora do raio é aceita mas fica marcada como fora do
                perímetro no registro.
              </span>
            </span>
          </label>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Para cadastrar a sede, o caminho mais simples é abrir esta tela{" "}
            <strong>estando na empresa</strong> e clicar em “Usar minha localização atual”. Para
            desligar a cerca, apague latitude e longitude e salve. Colaborador que não conseguir
            registrar por problema de GPS pode pedir ajuste pelo app — o pedido cai na análise do
            RH.
          </p>

          <Button type="button" onClick={salvarCerca} disabled={salvandoCerca}>
            {salvandoCerca ? "Salvando…" : "Salvar cerca de localização"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Network className="size-4 text-muted-foreground" />
            Rede autorizada (trava de IP)
          </CardTitle>
          <CardDescription className="text-xs">
            Para empresa com <strong>IP fixo</strong>: com a trava ligada, o ponto só registra
            quando o celular estiver conectado ao Wi-Fi da empresa (saindo pela internet da
            empresa). Pelo 4G/5G da operadora, a batida é recusada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ipsAutorizados">IPs públicos autorizados</Label>
            <Input
              id="ipsAutorizados"
              placeholder="200.100.50.25, 200.100.50.26"
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              className="tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula se houver mais de um link. Para desligar a trava, apague a lista
              e salve.
            </p>
          </div>

          {travaIp.ipAtual && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Você está acessando agora do IP{" "}
                <strong className="text-foreground tabular-nums">{travaIp.ipAtual}</strong>
                {" "}— se está na rede da empresa, é este o IP a autorizar.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={usarMeuIp}>
                Adicionar meu IP atual
              </Button>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={exigirIp}
              onCheckedChange={(v) => setExigirIp(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Bloquear batida fora da rede autorizada</span>
              <span className="block text-xs text-muted-foreground">
                Desmarcado, a batida de fora é aceita mas fica marcada como fora da rede no
                registro.
              </span>
            </span>
          </label>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Confirme com a operadora que o IP do link é <strong>fixo</strong>: se for dinâmico, ele
            muda sozinho e de uma hora para outra ninguém consegue bater o ponto. As duas travas
            podem valer juntas — IP garante a rede, GPS garante o lugar. Quem não conseguir
            registrar pode pedir ajuste pelo próprio app, que cai na análise do RH.
          </p>

          <Button type="button" onClick={salvarIp} disabled={salvandoIp}>
            {salvandoIp ? "Salvando…" : "Salvar trava de IP"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GraduationCap className="size-4 text-muted-foreground" />
            Jornada do estagiário
          </CardTitle>
          <CardDescription className="text-xs">
            Vale só para quem tem contrato do tipo Estágio. Ao passar do limite, o sistema{" "}
            <strong>avisa e registra a marcação</strong> — não recusa. Recusar a saída deixaria o
            estagiário sem registro da hora em que foi embora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="horasDia">Horas por dia</Label>
              <Input
                id="horasDia"
                type="number"
                min={1}
                max={tetoDia}
                step="0.5"
                value={horasDia}
                onChange={(e) => setHorasDia(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">Máximo de {tetoDia}h — teto da lei.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="horasSemana">Horas por semana</Label>
              <Input
                id="horasSemana"
                type="number"
                min={1}
                max={tetoSemana}
                step="1"
                value={horasSemana}
                onChange={(e) => setHorasSemana(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Máximo de {tetoSemana}h — teto da lei. A semana conta de segunda a domingo.
              </p>
            </div>
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            A <strong>Lei 11.788/2008, art. 10</strong> limita o estágio a {tetoDia} horas por dia e{" "}
            {tetoSemana} por semana (ensino superior, médio regular e educação profissional de nível
            médio). Você pode <strong>reduzir</strong> esses números como política da empresa —
            aumentar, não. Casos de educação especial e de anos finais do fundamental têm limite
            menor na lei (4h/20h) e hoje o sistema não os distingue: se houver algum no quadro, fale
            com a TI.
          </p>

          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
