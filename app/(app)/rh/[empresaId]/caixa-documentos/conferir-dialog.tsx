"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { confirmarItem } from "@/lib/actions/rh-caixa-documentos";
import { NORMAS_REGULAMENTADORAS, RESULTADOS_EXAME, TIPOS_EXAME } from "@/lib/constants-sst";
import { TIPOS_FOLHA } from "@/lib/caixa-documentos/extracao";
import { TIPOS_CAIXA, destinoDoTipo, visivelNoPortal, type TipoCaixa } from "@/lib/caixa-documentos/tipos";
import { Campo, CampoData, CampoSelect, CampoTexto, classeSelect } from "../colaboradores/[colaboradorId]/campos";
import type { FichaOpcao, ItemConferir } from "./caixa-view";

const ROTULO_FOLHA: Record<string, string> = {
  MENSAL: "Mensal",
  ADIANTAMENTO: "Adiantamento",
  DECIMO_TERCEIRO: "13º salário",
  FERIAS: "Férias",
  COMPLEMENTAR: "Complementar",
  PLR: "PLR",
};

/** "2026-09-10" → Date para os campos de data (que esperam Date). */
const data = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

export function ConferirDialog({
  item,
  fichas,
  aoFechar,
  aoGravar,
}: {
  item: ItemConferir;
  fichas: FichaOpcao[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoCaixa>(item.tipo === "NAO_E_DE_COLABORADOR" ? "OUTRO_DO_COLABORADOR" : item.tipo);
  const [colaboradorId, setColaboradorId] = useState(item.sugestaoId ?? "");
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState(item.paginaInicio);
  const [ate, setAte] = useState(item.paginaFim);
  const c = item.campos;

  const porId = useMemo(() => new Map(fichas.map((f) => [f.id, f])), [fichas]);
  const destaques = [...new Set([item.sugestaoId, ...item.opcoes].filter((x): x is string => !!x))]
    .map((id) => porId.get(id))
    .filter((f): f is FichaOpcao => !!f);
  const encontrados = busca.trim().length >= 2
    ? fichas
        .filter((f) => f.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()))
        .slice(0, 30)
    : [];
  const escolhida = porId.get(colaboradorId);
  const empresaDiferente = !!item.cnpjLido && !!escolhida && escolhida.cnpj !== item.cnpjLido;
  const vaiAoPortal = visivelNoPortal(tipo) || tipo === "OUTRO_DO_COLABORADOR";
  const paginasMudaram = de !== item.paginaInicio || ate !== item.paginaFim;
  // O CNPJ é o do ARQUIVO: a lista junta arquivos de todos os CNPJs que a pessoa vê.
  const verPaginas = `/api/rh/${item.empresaId}/caixa-documentos/${item.recebidoId}/paginas?item=${item.id}&de=${de}&ate=${ate}`;
  const intervalo = Array.from({ length: Math.max(0, ate - de + 1) }, (_, i) => de + i);
  // Página com duas pessoas não vai ao portal de nenhuma — o servidor recusa
  // de todo jeito; aqui só avisa antes.
  const mesmaEscolha = !paginasMudaram && colaboradorId === item.sugestaoId;
  // Mais de uma pessoa na página, ou (para a pessoa sugerida) só o CPF/PIS de
  // outra: não vai ao portal de ninguém — o servidor recusa de todo jeito;
  // aqui só avisa antes, em vez de deixar marcar "olhei" à toa.
  const variasPessoas =
    vaiAoPortal &&
    (intervalo.some((p) => (item.pessoasPorPagina[p] ?? 0) >= 2) || (mesmaEscolha && item.paginasDaSugestao === "OUTRA_PESSOA"));
  // A leitura já garantiu estas páginas para esta pessoa: não precisa do "olhei".
  const garantidas = item.paginasDaSugestao === "OK" && mesmaEscolha;

  const [gravando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Envio sem `<form action>`: aquele reseta os campos para o que a IA leu
  // quando a gravação volta com erro — e o clique seguinte gravaria o valor
  // errado sem ninguém ver (a competência corrigida voltava a ser a lida).
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    setErro(null);
    iniciar(async () => {
      const r = await confirmarItem(item.empresaId, item.id, { ok: true }, dados);
      if (r.ok) {
        toast.success("Gravado.");
        aoGravar();
      } else setErro(r.error ?? "Não foi possível gravar.");
    });
  };

  const Pessoa = ({ f }: { f: FichaOpcao }) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm",
        colaboradorId === f.id ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <input type="radio" name="_pessoa" className="mt-1" checked={colaboradorId === f.id} onChange={() => setColaboradorId(f.id)} />
      <span>
        <span className="font-medium">{f.nome}</span>
        {!f.ativo && <span className="ml-1 text-xs text-destructive">(desligado)</span>}
        <span className="block text-xs text-muted-foreground">
          {f.empresaNome} · {f.setor} · admissão {f.admissao} · CPF {f.cpfFinal}
        </span>
      </span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conferir e gravar</DialogTitle>
          <DialogDescription>
            {item.arquivo} · lido como <b>{item.nomeLido ?? "sem nome"}</b>
            {item.cpfMascarado ? ` · CPF ${item.cpfMascarado}` : item.temPis ? " · PIS lido" : ""}
          </DialogDescription>
        </DialogHeader>

        {item.motivos.length > 0 && (
          <Alert>
            <AlertDescription>
              {item.motivos.map((m, i) => (
                <span key={i} className="block text-xs">
                  {m}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <a
          href={verPaginas}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
        >
          <ExternalLink className="size-4" aria-hidden />
          Ver as páginas {de}
          {ate !== de ? `–${ate}` : ""} (abre em outra aba)
        </a>

        <form onSubmit={enviar} className="space-y-4">
          <input type="hidden" name="colaboradorId" value={colaboradorId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Tipo de documento" className="sm:col-span-3" required>
              <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCaixa)} className={classeSelect} required>
                {TIPOS_CAIXA.filter((t) => t.value !== "NAO_E_DE_COLABORADOR").map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                    {t.value === "OUTRO_DO_COLABORADOR" ? " (vai ao Dossiê como “Outro”)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Da página">
              <Input type="number" name="paginaInicio" min={item.janela.de} max={item.janela.ate} value={de} onChange={(e) => setDe(Number(e.target.value))} />
            </Campo>
            <Campo label="Até a página">
              <Input type="number" name="paginaFim" min={item.janela.de} max={item.janela.ate} value={ate} onChange={(e) => setAte(Number(e.target.value))} />
            </Campo>
            <p className="self-end pb-2 text-xs text-muted-foreground">
              de {item.paginasDoArquivo} no arquivo (dá para ir da {item.janela.de} à {item.janela.ate})
            </p>
          </div>

          <Campo label="Pessoa" required>
            <div className="space-y-2">
              {destaques.map((f) => (
                <Pessoa key={f.id} f={f} />
              ))}
              <Input placeholder="Buscar outra pessoa pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {encontrados.filter((f) => !destaques.some((d) => d.id === f.id)).map((f) => (
                <Pessoa key={f.id} f={f} />
              ))}
            </div>
          </Campo>

          {tipo === "ASO" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelect name="asoTipo" label="Tipo do exame" opcoes={TIPOS_EXAME} defaultValue={c.asoTipo} required />
              <CampoSelect name="asoResultado" label="Resultado" opcoes={RESULTADOS_EXAME} defaultValue={c.asoResultado} required />
              <CampoData name="dataDocumento" label="Realizado em" defaultValue={data(c.dataDocumento)} required />
              <CampoData name="validoAte" label="Válido até (opcional)" defaultValue={data(c.validoAte)} />
              <CampoTexto name="restricoes" label="Restrições (se apto com restrição)" defaultValue={c.restricoes} className="sm:col-span-2" />
              <CampoTexto name="medico" label="Médico" defaultValue={c.medico} />
              <CampoTexto name="crm" label="CRM" defaultValue={c.crm} />
              <CampoTexto name="clinica" label="Clínica" defaultValue={c.clinica} className="sm:col-span-2" />
            </div>
          )}

          {tipo === "CONTRACHEQUE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Competência (mês)" required>
                <Input type="month" name="competencia" defaultValue={c.competencia ?? ""} required />
              </Campo>
              <CampoSelect
                name="tipoFolha"
                label="Folha"
                opcoes={TIPOS_FOLHA.map((v) => ({ value: v, label: ROTULO_FOLHA[v] }))}
                defaultValue={c.tipoFolha ?? "MENSAL"}
              />
            </div>
          )}

          {tipo === "INFORME_RENDIMENTOS" && (
            <Campo label="Ano-calendário" required>
              <Input type="number" name="anoCalendario" min={1990} max={2100} defaultValue={c.anoCalendario ?? ""} required />
            </Campo>
          )}

          {tipo === "ATESTADO" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoData name="dataInicio" label="Primeiro dia" defaultValue={data(c.dataInicio)} required />
              <CampoData name="dataFim" label="Último dia" defaultValue={data(c.dataFim)} />
              <Campo label="Ou nº de dias">
                <Input type="number" name="dias" min={1} max={365} defaultValue={c.dias ?? ""} />
              </Campo>
              <CampoTexto name="medico" label="Médico" defaultValue={c.medico} />
              <CampoTexto name="crm" label="CRM" defaultValue={c.crm} />
            </div>
          )}

          {tipo === "CERTIFICADO_NR" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelect name="norma" label="Norma" opcoes={NORMAS_REGULAMENTADORAS} defaultValue={c.norma} required />
              <CampoData name="dataDocumento" label="Realizado em" defaultValue={data(c.dataDocumento)} required />
              <CampoData name="validoAte" label="Válido até (opcional)" defaultValue={data(c.validoAte)} />
              <Campo label="Carga horária (h)">
                <Input type="number" name="cargaHoraria" min={1} defaultValue={c.cargaHoraria ?? ""} />
              </Campo>
            </div>
          )}

          {destinoDoTipo(tipo, false) === "DOSSIE" && tipo !== "CONTRACHEQUE" && tipo !== "INFORME_RENDIMENTOS" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoData name="dataDocumento" label="Emitido em" defaultValue={data(c.dataDocumento)} />
              <CampoData name="validoAte" label="Válido até" defaultValue={data(c.validoAte)} />
              <CampoTexto name="descricao" label="Descrição" defaultValue={c.descricao} className="sm:col-span-2" />
            </div>
          )}

          {empresaDiferente && (
            <label className="flex items-start gap-2 rounded-md border border-destructive/40 p-2 text-sm">
              <input type="checkbox" name="confirmoEmpresa" className="mt-1" />
              <span>
                O CNPJ impresso no documento é de <b>outra empresa</b> que a desta ficha ({escolhida?.empresaNome}). Confirmo
                que é esta a ficha certa.
              </span>
            </label>
          )}
          {variasPessoas ? (
            <Alert variant="destructive">
              <AlertDescription>
                A leitura viu outra pessoa nestas páginas. Este tipo aparece no portal da pessoa, e ela veria os dados da
                outra — não dá para gravar assim. Ajuste as páginas ou a pessoa, ou anexe o documento pela ficha.
              </AlertDescription>
            </Alert>
          ) : (
            vaiAoPortal &&
            !garantidas && (
              <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <input type="checkbox" name="confirmoPaginas" className="mt-1" />
                <span>
                  Olhei as páginas {de}
                  {ate !== de ? `–${ate}` : ""}: são só desta pessoa. (Elas vão aparecer no portal dela.)
                </span>
              </label>
            )
          )}
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={gravando || variasPessoas}>
              {gravando ? "Gravando..." : "Gravar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
