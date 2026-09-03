"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstalarPwa } from "@/components/instalar-pwa";
import { entrarNoPonto } from "./actions";

// O CPF fica lembrado no aparelho (é do próprio dono): no dia a dia a pessoa
// digita só o PIN.
const CHAVE_CPF = "ponto-cpf";

const soDigitos = (v: string) => v.replace(/\D/g, "");

function formatarCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function EntrarPontoForm() {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Caso raro: o mesmo CPF+PIN vale em mais de uma empresa do grupo — a
  // pessoa escolhe onde está batendo, DEPOIS de o PIN já ter sido conferido.
  const [escolha, setEscolha] = useState<Array<{ colaboradorId: string; empresa: string }> | null>(null);

  // Depois da pintura, num callback (não no corpo do efeito — regra
  // set-state-in-effect): o servidor não tem localStorage, e preencher na
  // hidratação causaria mismatch.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const lembrado = localStorage.getItem(CHAVE_CPF);
      if (lembrado) setCpf(formatarCpf(lembrado));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  async function entrar(colaboradorId?: string) {
    setSalvando(true);
    setErro(null);
    try {
      const resultado = await entrarNoPonto({ cpf: soDigitos(cpf), pin, colaboradorId });
      if (!resultado.ok) {
        setErro(resultado.erro);
        setEscolha(null);
        return;
      }
      if ("escolher" in resultado) {
        setEscolha(resultado.escolher);
        return;
      }
      localStorage.setItem(CHAVE_CPF, soDigitos(cpf));
      router.refresh();
    } catch {
      setErro("Falha de conexão. Verifique a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bem-vindo(a)</h1>
        <p className="text-sm text-muted-foreground">
          Entre com seu CPF e o PIN fornecido pelo RH para bater o ponto.
        </p>
      </div>

      {escolha ? (
        <div className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium">Em qual empresa você está batendo o ponto?</p>
          {escolha.map((v) => (
            <Button
              key={v.colaboradorId}
              className="w-full justify-start"
              variant="outline"
              disabled={salvando}
              onClick={() => entrar(v.colaboradorId)}
            >
              <Building2 className="size-4" />
              {v.empresa}
            </Button>
          ))}
          <Button variant="ghost" className="w-full" onClick={() => setEscolha(null)}>
            Voltar
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-xl border bg-card p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void entrar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              className="h-12 text-base tracking-wide"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••••"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(soDigitos(e.target.value).slice(0, 6))}
              className="h-12 text-center text-xl tracking-[0.5em]"
              required
            />
          </div>

          {erro && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {erro}
            </p>
          )}

          <Button
            type="submit"
            className="h-12 w-full bg-success text-base hover:bg-success"
            disabled={salvando || soDigitos(cpf).length !== 11 || pin.length < 4}
          >
            <LogIn className="size-4" />
            {salvando ? "Entrando..." : "Entrar"}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <KeyRound className="size-3" />
            Esqueceu o PIN? Peça um novo ao RH.
          </p>
        </form>
      )}

      {/* O convite de instalação também ANTES do login: quem abre o /ponto
          pela primeira vez está na tela de entrada, e era só depois do PIN que
          o convite aparecia — tarde demais para o primeiro acesso (no iPhone,
          onde não existe popup nativo, a pessoa achava que não tinha app).
          Mesma chave de dispensa da tela logada: dispensou uma vez, valeu. */}
      <InstalarPwa
        escopo="/ponto"
        chaveDispensa="ponto-instalar-dispensado"
        titulo="Deixe o Ponto na tela do celular"
        descricaoAndroid="Abre direto pelo ícone, pronto para bater o ponto."
      />

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" />
        Registro conforme REP-P · Portaria MTP 671/2021
      </p>
    </div>
  );
}
