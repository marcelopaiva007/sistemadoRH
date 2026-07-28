"use client";

import { useActionState, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { atualizarMeusDados, enviarMeuDocumento } from "@/lib/actions/portal-cadastro";
import { TIPOS_DOCUMENTO } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

const inicial: ActionResult = { ok: true };

export type MeusDados = {
  email: string | null;
  telefone: string | null;
  estadoCivil: string | null;
  escolaridade: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  cep: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  emergenciaNome: string | null;
  emergenciaParentesco: string | null;
  emergenciaTelefone: string | null;
  rg: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  pis: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  tituloEleitor: string | null;
};

function Campo({
  name,
  label,
  defaultValue,
  className,
  ...props
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "defaultValue">) {
  return (
    <div className={className}>
      <Label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input id={name} name={name} defaultValue={defaultValue ?? ""} className="mt-1.5" {...props} />
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function MeuCadastro({ dados, faltando }: { dados: MeusDados; faltando: number }) {
  const [estado, acao, salvando] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await atualizarMeusDados(prev, fd);
    if (r.ok) toast.success("Dados atualizados. Obrigado!");
    return r;
  }, inicial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completar meu cadastro</CardTitle>
        <CardDescription>
          {faltando > 0
            ? `Faltam ${faltando} informação(ões) na sua ficha. Preencher ajuda o RH a manter tudo em dia.`
            : "Seus dados estão completos. Se algo mudou, é só corrigir aqui."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} className="space-y-6">
          {!estado.ok && estado.error && (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          <Secao titulo="Contato">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo name="telefone" label="Telefone / WhatsApp" defaultValue={dados.telefone} />
              <Campo name="email" label="E-mail" type="email" defaultValue={dados.email} />
            </div>
          </Secao>

          <Secao titulo="Dados pessoais">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo name="estadoCivil" label="Estado civil" defaultValue={dados.estadoCivil} />
              <Campo name="escolaridade" label="Escolaridade" defaultValue={dados.escolaridade} />
              <Campo name="nomeMae" label="Nome da mãe" defaultValue={dados.nomeMae} />
              <Campo name="nomePai" label="Nome do pai" defaultValue={dados.nomePai} />
              <Campo name="nacionalidade" label="Nacionalidade" defaultValue={dados.nacionalidade} />
              <Campo name="naturalidade" label="Cidade onde nasceu" defaultValue={dados.naturalidade} />
            </div>
          </Secao>

          {/* Quem tem o documento na mão digita muito melhor do que quem lê a
              foto depois. O RH confere contra o anexo e aprova — em vez de
              transcrever 253 fichas. */}
          <Secao titulo="Documentos">
            <p className="text-xs text-muted-foreground">
              Copie exatamente como está no documento. Envie também a foto na aba{" "}
              <b>Enviar documentos</b> — o RH confere os dois juntos.
            </p>
            <div className="grid gap-3 sm:grid-cols-6">
              <Campo name="rg" label="RG" defaultValue={dados.rg} className="sm:col-span-3" />
              <Campo name="rgOrgaoEmissor" label="Órgão emissor" defaultValue={dados.rgOrgaoEmissor} placeholder="SSP" className="sm:col-span-2" />
              <Campo name="rgUf" label="UF" defaultValue={dados.rgUf} maxLength={2} className="sm:col-span-1" />
              <Campo name="pis" label="PIS / PASEP / NIT" defaultValue={dados.pis} inputMode="numeric" className="sm:col-span-3" />
              <Campo name="tituloEleitor" label="Título de eleitor" defaultValue={dados.tituloEleitor} inputMode="numeric" className="sm:col-span-3" />
              <Campo name="ctpsNumero" label="CTPS — número" defaultValue={dados.ctpsNumero} className="sm:col-span-3" />
              <Campo name="ctpsSerie" label="CTPS — série" defaultValue={dados.ctpsSerie} className="sm:col-span-2" />
              <Campo name="ctpsUf" label="UF" defaultValue={dados.ctpsUf} maxLength={2} className="sm:col-span-1" />
            </div>
          </Secao>

          <Secao titulo="Endereço">
            <div className="grid gap-3 sm:grid-cols-6">
              <Campo name="cep" label="CEP" defaultValue={dados.cep} className="sm:col-span-2" inputMode="numeric" />
              <Campo name="logradouro" label="Rua / Avenida" defaultValue={dados.logradouro} className="sm:col-span-4" />
              <Campo name="numeroEndereco" label="Número" defaultValue={dados.numeroEndereco} className="sm:col-span-2" />
              <Campo name="complemento" label="Complemento" defaultValue={dados.complemento} className="sm:col-span-4" />
              <Campo name="bairro" label="Bairro" defaultValue={dados.bairro} className="sm:col-span-3" />
              <Campo name="cidade" label="Cidade" defaultValue={dados.cidade} className="sm:col-span-2" />
              <Campo name="uf" label="UF" defaultValue={dados.uf} maxLength={2} className="sm:col-span-1" />
            </div>
          </Secao>

          <Secao titulo="Em caso de emergência, avisar">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo name="emergenciaNome" label="Nome" defaultValue={dados.emergenciaNome} />
              <Campo name="emergenciaParentesco" label="Parentesco" defaultValue={dados.emergenciaParentesco} />
              <Campo name="emergenciaTelefone" label="Telefone" defaultValue={dados.emergenciaTelefone} />
            </div>
          </Secao>

          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar meus dados"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function EnviarDocumento({ enviados }: { enviados: { tipo: string; conferido: boolean }[] }) {
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [enviadoAgora, setEnviadoAgora] = useState(false);
  const [estado, acao, enviando] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await enviarMeuDocumento(prev, fd);
    if (r.ok) {
      toast.success("Documento enviado. O RH vai conferir.");
      setArquivoNome(null);
      setEnviadoAgora(true);
      // Limpa o campo — sem isso o nome do arquivo fica na tela e parece que
      // não enviou.
      const form = document.querySelector<HTMLFormElement>("form[data-envio-documento]");
      form?.reset();
    }
    return r;
  }, inicial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar documento</CardTitle>
        <CardDescription>
          Fotografe ou digitalize e envie. Aceita PDF, JPG, PNG ou WEBP, até 4 MB. O RH confere antes
          de anexar à sua ficha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Lista nomeada em vez de etiquetas soltas: quem enviou precisa
            reconhecer o próprio documento e saber em que pé está, senão manda
            de novo achando que não chegou. */}
        {enviados.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Você já enviou</p>
            {enviados.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm">{d.tipo}</span>
                {d.conferido ? (
                  <Badge variant="default" className="shrink-0">
                    <Check className="mr-1 size-3" />
                    Aceito pelo RH
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="shrink-0">
                    Em conferência
                  </Badge>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Enviou e ainda está em conferência? Não precisa mandar de novo — o RH avisa por aqui
              se algo estiver ilegível.
            </p>
          </div>
        )}

        <form action={acao} data-envio-documento className="space-y-4">
          {enviadoAgora && estado.ok && (
            <Alert>
              <AlertDescription>
                <b>Documento enviado.</b> Ele aparece na aba <b>Documentos</b> como “em
                conferência” até o RH validar.
              </AlertDescription>
            </Alert>
          )}
          {!estado.ok && estado.error && (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="tipo" className="text-xs font-medium text-muted-foreground">
              Qual documento?
            </Label>
            <select
              id="tipo"
              name="tipo"
              required
              className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Selecione...</option>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="arquivo" className="text-xs font-medium text-muted-foreground">
              Foto ou PDF
            </Label>
            <Input
              id="arquivo"
              name="arquivo"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-1.5"
              onChange={(e) => setArquivoNome(e.target.files?.[0]?.name ?? null)}
            />
            {arquivoNome && <p className="mt-1.5 text-xs text-muted-foreground">{arquivoNome}</p>}
          </div>

          <Button type="submit" disabled={enviando}>
            <Upload className="size-4" />
            {enviando ? "Enviando..." : "Enviar documento"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
