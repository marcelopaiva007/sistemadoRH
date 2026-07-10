"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { normalizarTexto } from "@/lib/text";
import { confirmarImportacao } from "@/lib/actions/importar";

type Cidade = { nome: string };
type Funcionario = { id: string; nome: string; cidade: Cidade | null };

const CAMPOS = [
  { key: "nome", label: "Nome do funcionário", obrigatorio: true },
  { key: "quantidade", label: "Quantidade", obrigatorio: false },
  { key: "aprovado", label: "Aprovado", obrigatorio: false },
  { key: "cancelado", label: "Cancelado", obrigatorio: false },
  { key: "valorInstalado", label: "Valor instalado", obrigatorio: false },
  { key: "qtdInternet", label: "Qtd. Internet", obrigatorio: false },
  { key: "qtdChip", label: "Qtd. Chip", obrigatorio: false },
  { key: "qtdGps", label: "Qtd. GPS", obrigatorio: false },
  { key: "qtdStreaming", label: "Qtd. Streaming", obrigatorio: false },
  { key: "qtdTelefoniaFixa", label: "Qtd. Telefonia Fixa", obrigatorio: false },
] as const;

type CampoKey = (typeof CAMPOS)[number]["key"];
type Mapping = Partial<Record<CampoKey, number>>;

type LinhaRevisao = {
  linhaIndex: number;
  nomeOriginal: string;
  funcionarioId: string;
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
};

function numeroDeCelula(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const limpo = v.replace(/[^\d,.-]/g, "").replace(",", ".");
    const n = parseFloat(limpo);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

export function ImportarView({
  funcionarios,
  periodoInicial,
}: {
  funcionarios: Funcionario[];
  periodoInicial: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "mapear" | "revisar">("upload");
  const [arquivoNome, setArquivoNome] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [linhas, setLinhas] = useState<LinhaRevisao[]>([]);
  const [enviando, setEnviando] = useState(false);

  const funcionariosPorNomeNormalizado = useMemo(() => {
    const mapa = new Map<string, Funcionario>();
    for (const f of funcionarios) mapa.set(normalizarTexto(f.nome), f);
    return mapa;
  }, [funcionarios]);

  async function handleFile(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (data.length < 2) {
      toast.error("Não foi possível ler linhas de dados nesse arquivo.");
      return;
    }
    const headerRow = (data[0] as unknown[]).map((h) => String(h ?? "").trim());
    const dataRows = data.slice(1) as unknown[][];

    setArquivoNome(file.name);
    setHeaders(headerRow);
    setRows(dataRows);

    const storageKey = `lm-import-mapping:${headerRow.join("|")}`;
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved) {
      setMapping(JSON.parse(saved));
    } else {
      const guess: Mapping = {};
      headerRow.forEach((h, idx) => {
        const norm = normalizarTexto(h);
        for (const campo of CAMPOS) {
          if (norm.includes(normalizarTexto(campo.label.split(" ").pop() ?? campo.label))) {
            guess[campo.key] = idx;
          }
        }
        if (norm.includes("nome") || norm.includes("funcionario") || norm.includes("vendedor")) {
          guess.nome = idx;
        }
      });
      setMapping(guess);
    }

    setStep("mapear");
  }

  function avancarParaRevisao() {
    if (mapping.nome == null) {
      toast.error("Selecione a coluna com o nome do funcionário.");
      return;
    }

    const storageKey = `lm-import-mapping:${headers.join("|")}`;
    localStorage.setItem(storageKey, JSON.stringify(mapping));

    const construidas: LinhaRevisao[] = rows.map((row, idx) => {
      const nomeOriginal = String(row[mapping.nome!] ?? "").trim();
      const match = funcionariosPorNomeNormalizado.get(normalizarTexto(nomeOriginal));
      const campo = (key: CampoKey) => (mapping[key] != null ? numeroDeCelula(row[mapping[key]!]) : 0);
      return {
        linhaIndex: idx,
        nomeOriginal,
        funcionarioId: match?.id ?? "",
        quantidade: campo("quantidade"),
        aprovado: campo("aprovado"),
        cancelado: campo("cancelado"),
        valorInstalado: campo("valorInstalado"),
        qtdInternet: campo("qtdInternet"),
        qtdChip: campo("qtdChip"),
        qtdGps: campo("qtdGps"),
        qtdStreaming: campo("qtdStreaming"),
        qtdTelefoniaFixa: campo("qtdTelefoniaFixa"),
      };
    }).filter((l) => l.nomeOriginal !== "");

    setLinhas(construidas);
    setStep("revisar");
  }

  function atualizarFuncionarioDaLinha(linhaIndex: number, funcionarioId: string) {
    setLinhas((prev) => prev.map((l) => (l.linhaIndex === linhaIndex ? { ...l, funcionarioId } : l)));
  }

  const linhasSemMatch = linhas.filter((l) => !l.funcionarioId);
  const linhasProntas = linhas.filter((l) => l.funcionarioId);

  async function handleConfirmar() {
    if (linhasSemMatch.length > 0) {
      toast.error("Ainda há linhas sem funcionário associado.");
      return;
    }
    setEnviando(true);
    const result = await confirmarImportacao({
      periodo,
      arquivoNome,
      linhas: linhasProntas.map((l) => ({
        funcionarioId: l.funcionarioId,
        quantidade: l.quantidade,
        aprovado: l.aprovado,
        cancelado: l.cancelado,
        valorInstalado: l.valorInstalado,
        qtdInternet: l.qtdInternet,
        qtdChip: l.qtdChip,
        qtdGps: l.qtdGps,
        qtdStreaming: l.qtdStreaming,
        qtdTelefoniaFixa: l.qtdTelefoniaFixa,
      })),
    });
    setEnviando(false);
    if (result.ok) {
      toast.success(`${linhasProntas.length} lançamento(s) importado(s) com sucesso.`);
      router.push(`/lancamentos?periodo=${periodo}`);
    } else {
      toast.error(result.error);
    }
  }

  if (step === "upload") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Upload className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Selecione o arquivo exportado do sistema de vendas</p>
            <p className="text-sm text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</p>
          </div>
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="max-w-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </CardContent>
      </Card>
    );
  }

  if (step === "mapear") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeamento de colunas — {arquivoNome}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CAMPOS.map((campo) => (
              <div key={campo.key} className="grid grid-cols-2 items-center gap-3">
                <Label>
                  {campo.label}
                  {campo.obrigatorio && <span className="text-destructive"> *</span>}
                </Label>
                <Select
                  value={mapping[campo.key] != null ? String(mapping[campo.key]) : ""}
                  onValueChange={(v) =>
                    setMapping((prev) => ({ ...prev, [campo.key]: v === "" ? undefined : Number(v) }))
                  }
                  items={Object.fromEntries([
                    ["", "— não usar —"],
                    ...headers.map((h, idx) => [String(idx), h || `Coluna ${idx + 1}`]),
                  ])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— não usar —</SelectItem>
                    {headers.map((h, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {h || `Coluna ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="grid grid-cols-2 items-center gap-3 border-t pt-3">
              <Label>Período de referência</Label>
              <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          <Button onClick={avancarParaRevisao}>
            Continuar
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {linhasSemMatch.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            {linhasSemMatch.length} linha(s) sem funcionário correspondente cadastrado.
            Selecione manualmente ou cadastre o funcionário antes de importar.
          </AlertDescription>
        </Alert>
      )}
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>
          {linhasProntas.length} de {linhas.length} linha(s) prontas para importar no período{" "}
          {periodo}.
        </AlertDescription>
      </Alert>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome na planilha</TableHead>
              <TableHead>Funcionário no sistema</TableHead>
              <TableHead className="text-right">Aprovado</TableHead>
              <TableHead className="text-right">Valor Instalado</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.linhaIndex}>
                <TableCell className="font-medium">{l.nomeOriginal}</TableCell>
                <TableCell>
                  <Select
                    value={l.funcionarioId}
                    onValueChange={(v) => atualizarFuncionarioDaLinha(l.linhaIndex, v ?? "")}
                    items={Object.fromEntries(funcionarios.map((f) => [f.id, f.nome]))}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">{l.aprovado}</TableCell>
                <TableCell className="text-right">
                  {l.valorInstalado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </TableCell>
                <TableCell>
                  {l.funcionarioId ? (
                    <Badge>OK</Badge>
                  ) : (
                    <Badge variant="destructive">Sem match</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep("mapear")}>
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <Button onClick={handleConfirmar} disabled={enviando || linhasSemMatch.length > 0}>
          {enviando ? "Importando..." : `Confirmar importação de ${linhasProntas.length} lançamento(s)`}
        </Button>
      </div>
    </div>
  );
}
