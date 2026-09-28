"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import { FileUp, Inbox, Loader2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Indicador } from "@/components/indicador";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FaixaDeIndicadores } from "@/components/padroes/faixa-de-indicadores";
import { cn } from "@/lib/utils";
import {
  descartarItem,
  descartarNaoColaborador,
  descartarRecebido,
  desfazerItem,
  tentarDeNovo,
} from "@/lib/actions/rh-caixa-documentos";
import type { CamposLidos } from "@/lib/caixa-documentos/extracao";
import { MIMES_CAIXA, tipoCaixaLabel, type TipoCaixa } from "@/lib/caixa-documentos/tipos";
import { ConferirDialog } from "./conferir-dialog";

export type ArquivoNaCaixa = {
  id: string;
  nome: string;
  status: string;
  paginas: number | null;
  paginasLidas: number;
  gravados: number;
  conferir: number;
  descartados: number;
  naoColaborador: number;
  erro: string | null;
  resumo: string | null;
  enviadoPor: string;
  enviadoEm: string;
  originalGuardado: boolean;
};

export type ItemConferir = {
  id: string;
  recebidoId: string;
  arquivo: string;
  paginasDoArquivo: number;
  tipo: TipoCaixa;
  paginaInicio: number;
  paginaFim: number;
  nomeLido: string | null;
  cpfMascarado: string | null;
  temPis: boolean;
  cnpjLido: string | null;
  confianca: number;
  motivos: string[];
  sugestaoId: string | null;
  opcoes: string[];
  campos: CamposLidos;
  inventarioDuvidoso: boolean;
  originalGuardado: boolean;
};

export type ItemGravado = {
  id: string;
  arquivo: string;
  tipo: TipoCaixa;
  pessoa: string;
  link: string | null;
  destino: string;
  quando: string;
  quem: string;
  podeDesfazer: boolean;
};

export type FichaOpcao = {
  id: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  cnpj: string | null;
  setor: string;
  admissao: string;
  ativo: boolean;
  cpfFinal: string;
};

type Progresso = {
  id: string;
  status: string;
  paginas: number | null;
  paginasLidas: number;
  itens: { total: number; gravados: number; conferir: number; pendentes: number };
  erro: string | null;
  ocupado?: boolean;
  iaIndisponivel?: boolean;
  iaDesligada?: boolean;
};

type Envio = { chave: string; nome: string; etapa: "subindo" | "registrando" | "pronto" | "erro"; pct: number; erro?: string };

const ATIVOS = ["PENDENTE", "LENDO", "ROTEANDO"];
const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Na fila",
  LENDO: "Lendo",
  ROTEANDO: "Encaminhando",
  CONCLUIDO: "Concluído",
  ERRO: "Com erro",
  DESCARTADO: "Descartado",
};

/** Tipo pelo nome quando o navegador não diz (acontece com PDF em alguns sistemas). */
function tipoDoArquivo(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "";
}

export function CaixaView(props: {
  empresaId: string;
  arquivos: ArquivoNaCaixa[];
  conferir: ItemConferir[];
  gravados: ItemGravado[];
  fichas: FichaOpcao[];
  iaLigada: boolean;
  podeConfigurarIa: boolean;
  comBlob: boolean;
  ambienteDeTeste: boolean;
  empresasSemCnpj: string[];
  totalEmpresas: number;
  diasGuardaOriginal: number;
}) {
  const { empresaId, arquivos, conferir, gravados } = props;
  const router = useRouter();
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [progresso, setProgresso] = useState<Record<string, Progresso>>({});
  const [pausa, setPausa] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<ItemConferir | null>(null);
  const [aba, setAba] = useState(conferir.length > 0 ? "conferir" : "arquivos");
  const fila = useRef<Set<string>>(new Set());
  const emAndamento = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- A leitura: a própria tela chama a rota, rodada a rodada -------------
  const dirigir = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setRodando(true);
    const trabalhador = async () => {
      while (fila.current.size > 0) {
        const id = fila.current.values().next().value as string;
        fila.current.delete(id);
        let p: Progresso | null = null;
        try {
          const r = await fetch(`/api/rh/${empresaId}/caixa-documentos/${id}/avancar`, { method: "POST" });
          p = r.ok ? ((await r.json()) as Progresso) : null;
        } catch {
          p = null;
        }
        if (!p) {
          // Rede caiu ou a rodada estourou o tempo: espera e tenta de novo.
          await new Promise((ok) => setTimeout(ok, 8000));
          fila.current.add(id);
          continue;
        }
        setProgresso((atual) => ({ ...atual, [id]: p! }));
        if (p.iaDesligada || p.iaIndisponivel) {
          setPausa(
            p.iaDesligada
              ? "A leitura automática está desligada. Os arquivos ficam guardados e são lidos quando ela for ligada."
              : (p.erro ?? "A leitura automática parou."),
          );
          fila.current.clear();
          break;
        }
        if (p.ocupado) {
          await new Promise((ok) => setTimeout(ok, 6000));
          fila.current.add(id);
          continue;
        }
        if (ATIVOS.includes(p.status)) fila.current.add(id);
        else router.refresh();
      }
    };
    // Dois arquivos por vez: rápido o bastante sem estourar o limite da conta.
    await Promise.all([trabalhador(), trabalhador()]);
    emAndamento.current = false;
    setRodando(false);
    router.refresh();
  }, [empresaId, router]);

  useEffect(() => {
    if (!props.iaLigada) return;
    for (const a of arquivos) if (ATIVOS.includes(a.status)) fila.current.add(a.id);
    if (fila.current.size > 0) void dirigir();
  }, [arquivos, dirigir, props.iaLigada]);

  // Atualiza as listas de tempos em tempos enquanto lê (gravados e conferir).
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [rodando, router]);

  useEffect(() => {
    if (!rodando && !envios.some((e) => e.etapa === "subindo" || e.etapa === "registrando")) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [rodando, envios]);

  // --- O envio ---------------------------------------------------------------
  const atualizarEnvio = (chave: string, dados: Partial<Envio>) =>
    setEnvios((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...dados } : e)));

  async function enviarUm(arquivo: File, chave: string) {
    const mimeType = tipoDoArquivo(arquivo);
    try {
      const ini = await fetch(`/api/rh/${empresaId}/caixa-documentos/iniciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: arquivo.name, tamanho: arquivo.size, mimeType }),
      });
      const iniJson = (await ini.json()) as { id?: string; modo?: string; pathname?: string; error?: string };
      if (!ini.ok || !iniJson.id) throw new Error(iniJson.error ?? "Não foi possível começar o envio.");

      let registro: Response;
      if (iniJson.modo === "blob") {
        const blob = await upload(iniJson.pathname!, arquivo, {
          access: "private",
          handleUploadUrl: `/api/rh/${empresaId}/caixa-documentos/upload`,
          contentType: mimeType,
          onUploadProgress: ({ percentage }) => atualizarEnvio(chave, { pct: Math.round(percentage) }),
        });
        atualizarEnvio(chave, { etapa: "registrando", pct: 100 });
        registro = await fetch(`/api/rh/${empresaId}/caixa-documentos/${iniJson.id}/concluir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pathname: blob.pathname }),
        });
      } else {
        const corpo = new FormData();
        corpo.append("arquivo", new File([arquivo], arquivo.name, { type: mimeType }));
        atualizarEnvio(chave, { etapa: "registrando", pct: 100 });
        registro = await fetch(`/api/rh/${empresaId}/caixa-documentos/${iniJson.id}/enviar`, { method: "POST", body: corpo });
      }
      const regJson = (await registro.json()) as { ok?: boolean; error?: string };
      if (!registro.ok || !regJson.ok) throw new Error(regJson.error ?? "Não foi possível registrar o arquivo.");
      atualizarEnvio(chave, { etapa: "pronto" });
      fila.current.add(iniJson.id);
    } catch (e) {
      atualizarEnvio(chave, { etapa: "erro", erro: e instanceof Error ? e.message : "Falha no envio." });
    }
  }

  async function enviar(lista: FileList | File[]) {
    const arquivosNovos = Array.from(lista);
    if (arquivosNovos.length === 0) return;
    const novos: Envio[] = arquivosNovos.map((f, i) => ({ chave: `${Date.now()}-${i}-${f.name}`, nome: f.name, etapa: "subindo", pct: 0 }));
    setEnvios((atual) => [...novos, ...atual].slice(0, 50));
    // Três envios por vez.
    const pendentes = arquivosNovos.map((f, i) => [f, novos[i].chave] as const);
    const trabalhador = async () => {
      while (pendentes.length > 0) {
        const [f, chave] = pendentes.shift()!;
        await enviarUm(f, chave);
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    router.refresh();
    if (props.iaLigada) void dirigir();
  }

  // --- Ações da fila ---------------------------------------------------------
  async function executar(acao: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    const r = await acao();
    if (r.ok) {
      toast.success(sucesso);
      router.refresh();
    } else toast.error(r.error ?? "Não foi possível.");
  }

  const emLeitura = arquivos.filter((a) => ATIVOS.includes(a.status));
  const comErro = arquivos.filter((a) => a.status === "ERRO");
  const limite = props.comBlob ? "20 MB" : "4 MB";

  // Depois de gravar, abre o seguinte que dá para conferir — pula as páginas
  // "sem pessoa" (essas só se descartam) e as de original já apagado.
  const proximo = (atual: ItemConferir) => {
    const i = conferir.findIndex((c) => c.id === atual.id);
    return conferir.slice(i + 1).find((c) => c.tipo !== "NAO_E_DE_COLABORADOR" && c.originalGuardado) ?? null;
  };

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Caixa de documentos"
        resumo={
          <>
            Solte aqui os PDFs que chegam do contador — contracheques, ASOs, atestados, certificados, documentos
            pessoais. A leitura automática identifica o documento e a pessoa e guarda cada um no lugar certo.
            {conferir.length > 0 && (
              <>
                {" "}
                <b className="text-foreground">{conferir.length}</b> esperando você conferir.
              </>
            )}
          </>
        }
      />

      {props.ambienteDeTeste && (
        <Alert variant="destructive">
          <AlertDescription>
            Endereço de teste com dados reais: aqui nada é gravado sozinho — tudo para em “Para conferir”. O que você
            gravar vai para as fichas e o portal de verdade.
          </AlertDescription>
        </Alert>
      )}

      {!props.iaLigada && (
        <Alert>
          <AlertDescription>
            {props.podeConfigurarIa ? (
              <>
                A leitura automática está desligada: falta cadastrar a chave da IA.{" "}
                <Link href={`/rh/${empresaId}/assistente`} className="font-semibold underline">
                  Ligar em Assistente de RH
                </Link>
                . Os arquivos enviados ficam guardados e são lidos depois.
              </>
            ) : (
              <>
                A leitura automática está desligada. Peça a um administrador (Admin ou Diretoria) para ligá-la. Os
                arquivos enviados ficam guardados e são lidos depois.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {pausa && (
        <Alert variant="destructive">
          <AlertDescription>{pausa}</AlertDescription>
        </Alert>
      )}

      {props.empresasSemCnpj.length > 0 && (
        <Alert>
          <AlertDescription>
            {props.empresasSemCnpj.length === 1 ? "A empresa" : "As empresas"}{" "}
            <b>{props.empresasSemCnpj.join(", ")}</b> {props.empresasSemCnpj.length === 1 ? "está" : "estão"} sem CNPJ
            cadastrado: contracheque, ASO e rescisão dessas empresas sempre param em “Para conferir” (é o CNPJ
            impresso no documento que confirma a ficha). Cadastre em Marcas &amp; CNPJs.
          </AlertDescription>
        </Alert>
      )}

      <FaixaDeIndicadores colunas={4}>
        <Indicador rotulo="Para conferir" valor={conferir.length} estado={conferir.length > 0 ? "atencao" : "padrao"} complemento="um clique cada" />
        <Indicador rotulo="Gravados" valor={gravados.length} complemento="nos arquivos listados" />
        <Indicador rotulo="Em leitura" valor={emLeitura.length} complemento={rodando ? "lendo agora" : emLeitura.length ? "retoma com a tela aberta" : "—"} />
        <Indicador rotulo="Com erro" valor={comErro.length} estado={comErro.length > 0 ? "alerta" : "padrao"} />
      </FaixaDeIndicadores>

      {/* --- Soltar arquivos --------------------------------------------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void enviar(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors",
          arrastando && "border-primary bg-primary/5",
        )}
      >
        <FileUp className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="mt-2 font-medium">Arraste os arquivos para cá</p>
        <p className="text-sm text-muted-foreground">PDF, JPG, PNG ou WEBP · vários de uma vez · até {limite} cada</p>
        <Button className="mt-3" onClick={() => inputRef.current?.click()}>
          Escolher arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...MIMES_CAIXA, ".pdf"].join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void enviar(e.target.files);
            e.target.value = "";
          }}
        />
        <ul className="mx-auto mt-4 max-w-2xl space-y-1 text-left text-xs text-muted-foreground">
          <li>
            • Procuramos as pessoas{" "}
            {props.totalEmpresas === 1 ? "na empresa" : `em todas as ${props.totalEmpresas} empresas`} que você acessa (pelo
            CPF ou PIS, e pelo CNPJ impresso no documento).
          </li>
          <li>• Contracheques, recibos, informes e atestados aparecem no portal da pessoa assim que gravados.</li>
          <li>
            • Cada pessoa recebe só as páginas dela. O arquivo original é apagado {props.diasGuardaOriginal} dias depois
            de tudo resolvido (até lá dá para desfazer).
          </li>
          <li>• A leitura só anda com esta tela aberta. Se fechar, ela pausa e continua quando você voltar.</li>
        </ul>
      </div>

      {envios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Envios desta sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {envios.map((e) => (
              <div key={e.chave} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                {e.etapa === "subindo" && <span className="text-muted-foreground tabular-nums">subindo {e.pct}%</span>}
                {e.etapa === "registrando" && <span className="text-muted-foreground">conferindo o arquivo…</span>}
                {e.etapa === "pronto" && <Badge variant="secondary">na fila de leitura</Badge>}
                {e.etapa === "erro" && <span className="text-destructive">{e.erro}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(String(v))}>
        <TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="conferir">Para conferir ({conferir.length})</TabsTrigger>
          <TabsTrigger value="gravados">Gravados ({gravados.length})</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos enviados ({arquivos.length})</TabsTrigger>
        </TabsList>

        {/* --- Para conferir ---------------------------------------------- */}
        <TabsContent value="conferir" className="space-y-4 pt-4">
          {conferir.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 size-6" aria-hidden />
              Nada esperando conferência.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Pessoa lida</TableHead>
                    <TableHead>Por que não gravou sozinho</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conferir.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="font-medium">{tipoCaixaLabel(c.tipo)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.arquivo} · pág. {c.paginaInicio}
                          {c.paginaFim !== c.paginaInicio ? `–${c.paginaFim}` : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        {c.nomeLido ?? "—"}
                        <span className="block text-xs text-muted-foreground">
                          {c.cpfMascarado ?? (c.temPis ? "PIS lido" : "sem CPF/PIS")}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md text-xs">
                        {c.motivos.map((m, i) => (
                          <span key={i} className="block">
                            {m}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.tipo !== "NAO_E_DE_COLABORADOR" && (
                            <Button size="sm" aria-haspopup="dialog" onClick={() => setAberto(c)} disabled={!c.originalGuardado}>
                              Conferir e gravar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => executar(() => descartarItem(empresaId, c.id), "Descartado.")}
                          >
                            Descartar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* --- Gravados --------------------------------------------------- */}
        <TabsContent value="gravados" className="pt-4">
          {gravados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento gravado ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Onde ficou</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gravados.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        <span className="font-medium">{tipoCaixaLabel(g.tipo)}</span>
                        <span className="block text-xs text-muted-foreground">{g.arquivo}</span>
                      </TableCell>
                      <TableCell>
                        {g.link ? (
                          <Link href={g.link} className="hover:underline">
                            {g.pessoa}
                          </Link>
                        ) : (
                          g.pessoa
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{g.destino}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.quando}
                        <span className="block">{g.quem}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {g.podeDesfazer && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Desfazer: apagar este ${tipoCaixaLabel(g.tipo).toLowerCase()} da ficha de ${g.pessoa} e voltar para a conferência?`)) {
                                void executar(() => desfazerItem(empresaId, g.id), "Desfeito — voltou para a conferência.");
                              }
                            }}
                          >
                            <Undo2 className="size-4" aria-hidden /> Desfazer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* --- Arquivos enviados ------------------------------------------ */}
        <TabsContent value="arquivos" className="pt-4">
          {arquivos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum arquivo enviado ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arquivos.map((a) => {
                    const p = progresso[a.id];
                    const status = p?.status ?? a.status;
                    const lidas = p?.paginasLidas ?? a.paginasLidas;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-xs">
                          <span className="block truncate font-medium">{a.nome}</span>
                          {a.resumo && <span className="block truncate text-xs text-muted-foreground">{a.resumo}</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status === "ERRO" ? "destructive" : status === "CONCLUIDO" ? "default" : "secondary"}>
                            {ATIVOS.includes(status) && rodando && <Loader2 className="size-3 animate-spin" aria-hidden />}
                            {ROTULO_STATUS[status] ?? status}
                          </Badge>
                          {a.paginas && ATIVOS.includes(status) && (
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {lidas} de {a.paginas} página(s) lidas
                            </span>
                          )}
                          {(p?.erro ?? a.erro) && <span className="block text-xs text-destructive">{p?.erro ?? a.erro}</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p?.itens.gravados ?? a.gravados} gravado(s) · {p?.itens.conferir ?? a.conferir} para conferir
                          {a.descartados > 0 && ` · ${a.descartados} descartado(s)`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.enviadoEm}
                          <span className="block">{a.enviadoPor}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {a.naoColaborador > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => executar(() => descartarNaoColaborador(empresaId, a.id), "Páginas descartadas.")}
                              >
                                Descartar {a.naoColaborador} sem pessoa
                              </Button>
                            )}
                            {status === "ERRO" && (
                              <Button size="sm" variant="outline" onClick={() => executar(() => tentarDeNovo(empresaId, a.id), "De volta à fila.")}>
                                <RotateCcw className="size-4" aria-hidden /> Tentar de novo
                              </Button>
                            )}
                            {status !== "DESCARTADO" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Descartar arquivo"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Descartar "${a.nome}"? O que falta conferir sai da fila. ${a.gravados ? `Os ${a.gravados} já gravados continuam nas fichas (use Desfazer para tirá-los).` : ""}`,
                                    )
                                  ) {
                                    void executar(() => descartarRecebido(empresaId, a.id), "Arquivo descartado.");
                                  }
                                }}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {aberto && (
        <ConferirDialog
          key={aberto.id}
          empresaId={empresaId}
          item={aberto}
          fichas={props.fichas}
          aoFechar={() => setAberto(null)}
          aoGravar={() => {
            const seguinte = proximo(aberto);
            setAberto(seguinte);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
