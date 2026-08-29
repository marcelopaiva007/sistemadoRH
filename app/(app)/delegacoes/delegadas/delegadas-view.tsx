"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { criarDemanda } from "@/lib/actions/delegacoes";
import {
  OPCOES_CRITICIDADE,
  OPCOES_EVIDENCIA,
  OPCOES_PERIODICIDADE,
} from "@/lib/constants-delegacoes";
import { TITULO_MAXIMO } from "@/lib/delegacoes/estados";
import type { DemandaNaTela } from "@/lib/delegacoes/consultas";
import { LinhaDemanda } from "../linha-demanda";

// Mesmas duas constantes de classe do módulo de Processos (contratos-view.tsx,
// veiculos-view.tsx, alugueis-view.tsx). Campo nativo com `CAMPO`, não os
// componentes de components/ui — misturar os dois na mesma grade desalinha,
// porque têm alturas e raios diferentes.
const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const SECAO = "sm:col-span-2 lg:col-span-4 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

type UsuarioOpcao = { id: string; nome: string; temTelegram: boolean };

/** O formulário nasce com estes valores — os mesmos padrões da spec. */
const FORM_VAZIO: Record<string, string> = {
  titulo: "",
  descricao: "",
  responsavelId: "",
  criterioAceite: "",
  evidenciaExigida: "TEXTO",
  criticidade: "3",
  prazo: "",
  periodicidadeRetorno: "SEMANAL",
  marcaId: "",
  area: "",
};

export function DelegadasView({
  demandas,
  usuarios,
  marcas,
}: {
  demandas: DemandaNaTela[];
  usuarios: UsuarioOpcao[];
  marcas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm((f) => (f ? { ...f, [nome]: e.target.value } : f)),
    };
  }

  function abrir() {
    setErro(null);
    setAviso(null);
    setForm({ ...FORM_VAZIO });
  }

  function fechar() {
    setForm(null);
    setErro(null);
  }

  function salvar(enviar: boolean) {
    if (!form) return;
    setErro(null);
    iniciar(async () => {
      const r = await criarDemanda({
        titulo: form.titulo,
        descricao: form.descricao,
        responsavelId: form.responsavelId,
        criterioAceite: form.criterioAceite,
        evidenciaExigida: form.evidenciaExigida,
        criticidade: Number(form.criticidade || "3"),
        prazo: form.prazo,
        periodicidadeRetorno: form.periodicidadeRetorno,
        marcaId: form.marcaId || null,
        area: form.area,
        enviar,
      });
      if (!r.ok) {
        // O formulário CONTINUA aberto com o que a pessoa digitou.
        setErro(r.error);
        return;
      }
      setForm(null);
      // O aviso de Telegram persiste depois de fechar o formulário: é
      // informação sobre o que o sistema ainda não vai conseguir fazer, e
      // escondê-la junto com o formulário seria omitir.
      setAviso(r.avisoTelegram ?? null);
      // Rascunho leva direto ao detalhe: é lá que mora o "Enviar ao
      // responsável", e voltar para a lista deixaria a pessoa procurando.
      if (!enviar && r.id) {
        router.push(`/delegacoes/${r.id}`);
        return;
      }
      router.refresh();
    });
  }

  const responsavelEscolhido = usuarios.find((u) => u.id === form?.responsavelId);
  const aguardandoMeuAceite = demandas.filter((d) => d.status === "ENTREGUE");
  const rascunhos = demandas.filter((d) => d.status === "RASCUNHO");
  const emAndamento = demandas.filter((d) => d.status !== "ENTREGUE" && d.status !== "RASCUNHO");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Delegações
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Delegadas por mim</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O que você pediu e ainda não recebeu de volta. Só você encerra uma demanda sua.
          </p>
        </div>
        {!form && <Button onClick={abrir}>Nova demanda</Button>}
      </div>

      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {aviso}
        </p>
      )}

      {form && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova demanda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">O que precisa acontecer</span>
              <input className={CAMPO} maxLength={TITULO_MAXIMO} required {...campo("titulo")} />
            </label>

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">Contexto (opcional)</span>
              <textarea className={CAMPO} rows={2} {...campo("descricao")} />
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Responsável</span>
              <select className={CAMPO} required {...campo("responsavelId")}>
                <option value="">Escolha uma pessoa</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
              {/* O aviso da decisão da Direção: delegar para quem não tem
                  Telegram é PERMITIDO, e a pessoa precisa saber o que muda. */}
              {responsavelEscolhido && !responsavelEscolhido.temTelegram && (
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-500">
                  Sem Telegram vinculado — quando a cobrança automática entrar no ar, ela não
                  vai alcançar essa pessoa por lá.
                </span>
              )}
            </label>

            <label>
              <span className="mb-1 block text-xs text-muted-foreground">Prazo</span>
              <input type="date" className={CAMPO} required {...campo("prazo")} />
              <span className="mt-1 block text-xs text-muted-foreground">
                Vale até o fim do dia.
              </span>
            </label>

            <label>
              <span className="mb-1 block text-xs text-muted-foreground">Criticidade</span>
              <select className={CAMPO} {...campo("criticidade")}>
                {OPCOES_CRITICIDADE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <p className={SECAO}>Como vamos saber que ficou pronto</p>

            <label className="sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block text-xs text-muted-foreground">
                Critério de aceite — obrigatório
              </span>
              <textarea
                className={CAMPO}
                rows={2}
                required
                placeholder="Ex.: três orçamentos comparados, com prazo de entrega de cada fornecedor"
                {...campo("criterioAceite")}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Sem isto a demanda não é salva. É o que decide, depois, se a entrega vale.
              </span>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Evidência exigida</span>
              <select className={CAMPO} {...campo("evidenciaExigida")}>
                {OPCOES_EVIDENCIA.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Na entrega o sistema vai exigir {OPCOES_EVIDENCIA.find((o) => o.value === form.evidenciaExigida)?.ajuda}.
              </span>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Quero retorno</span>
              <select className={CAMPO} {...campo("periodicidadeRetorno")}>
                {OPCOES_PERIODICIDADE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <p className={SECAO}>Para achar depois (opcional)</p>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Empresa</span>
              <select className={CAMPO} {...campo("marcaId")}>
                <option value="">Não se aplica a uma empresa</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Área</span>
              <input className={CAMPO} maxLength={60} {...campo("area")} />
            </label>

            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <Button disabled={pendente} onClick={() => salvar(true)}>
                Delegar agora
              </Button>
              {/* Rascunho existe porque a spec tem o estado — serve para montar
                  a demanda sem disparar o relógio do aceite. */}
              <Button variant="outline" disabled={pendente} onClick={() => salvar(false)}>
                Salvar rascunho
              </Button>
              <Button variant="ghost" onClick={fechar}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {aguardandoMeuAceite.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Entregues — esperando você
              <Badge variant="outline">{aguardandoMeuAceite.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {aguardandoMeuAceite.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {rascunhos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Rascunhos — ainda não enviados
              <Badge variant="outline">{rascunhos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {rascunhos.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {emAndamento.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Em andamento
              <Badge variant="outline">{emAndamento.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {emAndamento.map((d) => (
              <LinhaDemanda key={d.id} d={d} mostrar="responsavel" />
            ))}
          </CardContent>
        </Card>
      )}

      {demandas.length === 0 && !form && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">Você ainda não delegou nada por aqui.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao delegar, o combinado e o prazo ficam registrados aqui.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
