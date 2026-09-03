"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellRing, CircleCheck, Info, VolumeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  definirDonoEPrazoSinal,
  descartarSinal,
  reconhecerSinal,
  virarPlanoDeAcaoDoSinal,
} from "@/lib/actions/sinais";
import {
  GRAVIDADE_SINAL,
  STATUS_SINAL_VIVOS,
  gravidadeSinalLabel,
  statusSinalLabel,
  tipoSinalLabel,
  type StatusSinal,
} from "@/lib/sinais";
import { cn } from "@/lib/utils";

/**
 * Central de Sinais — a tela onde alerta ganha dono, prazo e desfecho.
 *
 * O mecanismo de confiança é o coração: descartar exige motivo escrito; o
 * mesmo tipo descartado 2× seguidas na mesma unidade passa a nascer na aba
 * "Silenciados" por 60 dias (nunca some sem rastro); e "virar plano" cria o
 * registro na tela de Planos de Ação que já existia pronta. As regras moram em
 * lib/sinais.ts — aqui só se clica.
 */

export type SinalNaTela = {
  id: string;
  tipo: string;
  nivelUnidade: string;
  unidadeNome: string;
  titulo: string;
  observado: string;
  esperado: string;
  recorte: string | null;
  gravidade: string;
  status: string;
  motivoDescarte: string | null;
  donoUserId: string | null;
  donoNome: string | null;
  /** "aaaa-mm-dd" para o <input type="date">; vazia sem prazo. */
  prazoInput: string;
  prazoRotulo: string | null;
  silenciadoAteRotulo: string | null;
  /** Datas já formatadas no servidor — nenhum Date cruza para cá (fuso). */
  abertoDesde: string;
  diasAberto: number;
  confirmadoEm: string;
};

type Usuario = { id: string; nome: string };

const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function ehVivo(status: string): boolean {
  return STATUS_SINAL_VIVOS.includes(status as StatusSinal);
}

function corDaGravidade(gravidade: string): "destructive" | "default" | "secondary" {
  if (gravidade === "CRITICA") return "destructive";
  if (gravidade === "ALTA") return "default";
  return "secondary";
}

function rotuloDoNivel(nivel: string): string {
  if (nivel === "GRUPO") return "Grupo";
  if (nivel === "MARCA") return "Marca";
  if (nivel === "EMPRESA") return "CNPJ";
  if (nivel === "SETOR") return "Setor";
  return nivel;
}

export function SinaisView({
  empresaId,
  sinais,
  usuarios,
}: {
  empresaId: string;
  sinais: SinalNaTela[];
  usuarios: Usuario[];
}) {
  const vivos = sinais.filter(s => ehVivo(s.status));
  const silenciados = sinais.filter(s => s.status === "SILENCIADO");
  const descartados = sinais.filter(s => s.status === "DESCARTADO");
  const maisVelho = vivos.reduce<SinalNaTela | null>(
    (max, s) => (max === null || s.diasAberto > max.diasAberto ? s : max),
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BellRing className="size-5" />
          Central de Sinais
        </h2>
        <p className="text-sm text-muted-foreground">
          Cada sinal é um desvio detectado pelo sistema esperando um desfecho: reconhecer, virar
          plano de ação ou descartar — com motivo escrito, sempre. O detector roda uma vez por dia.
        </p>
      </div>

      {/* Topo: quantos abertos e a idade do mais velho — o compromisso da tela
          é ninguém dizer "não vi". */}
      <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        {vivos.length > 0 ? (
          <BellRing className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
        )}
        <p>
          <span className="font-medium">
            {vivos.length === 0
              ? "Nenhum sinal em aberto."
              : `${vivos.length} ${vivos.length === 1 ? "sinal aberto" : "sinais abertos"}.`}
          </span>{" "}
          <span className="text-muted-foreground">
            {vivos.length > 0 && maisVelho
              ? `O mais velho espera desfecho há ${maisVelho.diasAberto} ${maisVelho.diasAberto === 1 ? "dia" : "dias"} (desde ${maisVelho.abertoDesde}).`
              : sinais.length === 0
                ? "Nenhum sinal foi registrado até agora — ou nenhum detector disparou, ou o cron diário ainda não rodou desde que a Central existe. Zero aqui não é auditoria de que está tudo bem."
                : `Todos os ${sinais.length} sinais registrados já têm desfecho.`}
          </span>
        </p>
      </div>

      <Tabs defaultValue="abertos">
        <TabsList variant="line">
          <TabsTrigger value="abertos">Abertos ({vivos.length})</TabsTrigger>
          <TabsTrigger value="silenciados">Silenciados ({silenciados.length})</TabsTrigger>
          <TabsTrigger value="descartados">Descartados ({descartados.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="abertos" className="space-y-4">
          {vivos.length === 0 ? (
            <VazioDaAba
              texto={
                sinais.length === 0
                  ? "Nada aqui ainda. Os sinais nascem da rodada diária dos detectores (planos vencidos, desligamentos concentrados, taxa de resposta baixa e o radar de desvio)."
                  : "Nenhum sinal em aberto — os registrados estão em Silenciados ou Descartados, ou viraram plano."
              }
            />
          ) : (
            GRAVIDADE_SINAL.map(g => {
              const doGrupo = vivos
                .filter(s => s.gravidade === g.value)
                .sort((a, b) => b.diasAberto - a.diasAberto);
              if (doGrupo.length === 0) return null;
              return (
                <div key={g.value} className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                    {g.label} ({doGrupo.length})
                  </p>
                  {doGrupo.map(s => (
                    <CartaoSinal key={s.id} empresaId={empresaId} sinal={s} usuarios={usuarios} />
                  ))}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="silenciados" className="space-y-2">
          {silenciados.length === 0 ? (
            <VazioDaAba texto="Nenhum sinal silenciado. Um sinal nasce aqui quando o mesmo tipo foi descartado 2 vezes seguidas na mesma unidade — fica 60 dias em silêncio, mas nunca some sem rastro." />
          ) : (
            silenciados.map(s => (
              <CartaoSinal key={s.id} empresaId={empresaId} sinal={s} usuarios={usuarios} />
            ))
          )}
        </TabsContent>

        <TabsContent value="descartados" className="space-y-2">
          {descartados.length === 0 ? (
            <VazioDaAba texto="Nenhum sinal descartado. Quando houver, o motivo escrito de cada descarte fica registrado aqui." />
          ) : (
            descartados.map(s => (
              <CartaoSinal key={s.id} empresaId={empresaId} sinal={s} usuarios={usuarios} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --------------------------------------------------------------------------

function VazioDaAba({ texto }: { texto: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{texto}</CardContent>
    </Card>
  );
}

function CartaoSinal({
  empresaId,
  sinal,
  usuarios,
}: {
  empresaId: string;
  sinal: SinalNaTela;
  usuarios: Usuario[];
}) {
  const [ocupado, setOcupado] = useState(false);
  const [descarteAberto, setDescarteAberto] = useState(false);
  const podeAgir = ehVivo(sinal.status) || sinal.status === "SILENCIADO";

  async function rodar(acao: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso: string) {
    setOcupado(true);
    const resultado = await acao();
    setOcupado(false);
    if (resultado.ok) toast.success(sucesso);
    else toast.error(resultado.error);
    return resultado.ok;
  }

  return (
    <Card className={cn(sinal.gravidade === "CRITICA" && ehVivo(sinal.status) && "border-destructive/40")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={corDaGravidade(sinal.gravidade)}>{gravidadeSinalLabel(sinal.gravidade)}</Badge>
          <Badge variant="outline">{tipoSinalLabel(sinal.tipo)}</Badge>
          <span className="text-xs text-muted-foreground">
            {rotuloDoNivel(sinal.nivelUnidade)} · {sinal.unidadeNome}
          </span>
          {sinal.status !== "ABERTO" && (
            <Badge variant="secondary" className="ml-auto">
              {statusSinalLabel(sinal.status)}
            </Badge>
          )}
        </div>

        <p className="text-sm font-medium">{sinal.titulo}</p>

        <p className="text-xs text-muted-foreground">
          Observado: <span className="text-foreground">{sinal.observado}</span> · Esperado:{" "}
          <span className="text-foreground">{sinal.esperado}</span>
        </p>

        <p className="text-xs text-muted-foreground">
          Aberto desde {sinal.abertoDesde} ({sinal.diasAberto}{" "}
          {sinal.diasAberto === 1 ? "dia" : "dias"}) · situação confirmada pelo detector em{" "}
          {sinal.confirmadoEm}
          {sinal.prazoRotulo && ` · prazo ${sinal.prazoRotulo}`}
        </p>

        {sinal.status === "SILENCIADO" && (
          <p className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <VolumeOff className="mt-0.5 size-3.5 shrink-0" />
            Em silêncio até {sinal.silenciadoAteRotulo ?? "—"}: este tipo de sinal foi descartado 2
            vezes seguidas nesta unidade. Está registrado aqui para nunca sumir sem rastro —
            reconhecer ou virar plano tira do silêncio.
          </p>
        )}

        {sinal.status === "DESCARTADO" && sinal.motivoDescarte && (
          <p className="rounded-md bg-muted/40 p-2 text-xs">
            <span className="font-medium">Motivo do descarte:</span>{" "}
            <span className="text-muted-foreground">{sinal.motivoDescarte}</span>
          </p>
        )}

        {podeAgir && (
          <DonoEPrazo empresaId={empresaId} sinal={sinal} usuarios={usuarios} ocupado={ocupado} rodar={rodar} />
        )}

        {podeAgir && (
          <div className="flex flex-wrap gap-2">
            {sinal.status !== "RECONHECIDO" && sinal.status !== "EM_PLANO" && (
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => rodar(() => reconhecerSinal(empresaId, sinal.id), "Sinal reconhecido.")}
              >
                Reconheci
              </Button>
            )}
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() =>
                rodar(
                  () => virarPlanoDeAcaoDoSinal(empresaId, sinal.id),
                  "Plano de ação criado — acompanhe na tela Planos de ação.",
                )
              }
            >
              Virar plano de ação
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              className="text-destructive"
              onClick={() => setDescarteAberto(true)}
            >
              Descartar…
            </Button>
          </div>
        )}

        {sinal.recorte && (
          <p className="flex items-start gap-2 border-t pt-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {sinal.recorte}
          </p>
        )}
      </CardContent>

      <DescarteDialog
        aberto={descarteAberto}
        aoFechar={() => setDescarteAberto(false)}
        ocupado={ocupado}
        aoConfirmar={async motivo => {
          const ok = await rodar(
            () => descartarSinal(empresaId, sinal.id, motivo),
            "Sinal descartado — o motivo fica registrado.",
          );
          if (ok) setDescarteAberto(false);
        }}
      />
    </Card>
  );
}

/**
 * Dono e prazo são escolha manual entre os usuários do sistema — não há
 * escalonamento automático de propósito: hoje nenhum usuário tem papel de
 * gestor de setor e User não tem vínculo com Colaborador, então qualquer
 * regra automática devolveria vazio em 100% dos casos.
 */
function DonoEPrazo({
  empresaId,
  sinal,
  usuarios,
  ocupado,
  rodar,
}: {
  empresaId: string;
  sinal: SinalNaTela;
  usuarios: Usuario[];
  ocupado: boolean;
  rodar: (
    acao: () => Promise<{ ok: true } | { ok: false; error: string }>,
    sucesso: string,
  ) => Promise<boolean>;
}) {
  const [dono, setDono] = useState(sinal.donoUserId ?? "");
  const [prazo, setPrazo] = useState(sinal.prazoInput);
  const mudou = dono !== (sinal.donoUserId ?? "") || prazo !== sinal.prazoInput;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`dono-${sinal.id}`} className="text-xs">
          Dono
        </Label>
        <select
          id={`dono-${sinal.id}`}
          value={dono}
          disabled={ocupado}
          onChange={e => setDono(e.target.value)}
          className={classeSelect + " w-auto"}
        >
          <option value="">Sem dono</option>
          {usuarios.map(u => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`prazo-${sinal.id}`} className="text-xs">
          Prazo
        </Label>
        <Input
          id={`prazo-${sinal.id}`}
          type="date"
          value={prazo}
          disabled={ocupado}
          onChange={e => setPrazo(e.target.value)}
          className="w-auto"
        />
      </div>
      {mudou && (
        <Button
          variant="secondary"
          size="sm"
          disabled={ocupado}
          onClick={() =>
            rodar(
              () => definirDonoEPrazoSinal(empresaId, sinal.id, dono || null, prazo || null),
              "Dono e prazo salvos.",
            )
          }
        >
          Salvar
        </Button>
      )}
    </div>
  );
}

function DescarteDialog({
  aberto,
  ocupado,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean;
  ocupado: boolean;
  aoFechar: () => void;
  aoConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open={aberto} onOpenChange={v => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descartar sinal</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-descarte">Motivo (obrigatório)</Label>
          <Textarea
            id="motivo-descarte"
            rows={3}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder='Ex.: "Saídas planejadas do fim do contrato da obra X — não é desvio."'
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            O motivo fica registrado no sinal e na auditoria. Descartar o mesmo tipo de sinal 2
            vezes seguidas na mesma unidade silencia os próximos por 60 dias — eles vão para a aba
            Silenciados, nunca somem sem rastro.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={ocupado || motivo.trim().length < 5}
            onClick={() => aoConfirmar(motivo)}
          >
            {ocupado ? "Descartando..." : "Descartar com este motivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
