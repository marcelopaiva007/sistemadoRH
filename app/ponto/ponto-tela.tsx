"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BaterPontoCard } from "@/app/portal/bater-ponto-card";
import { SolicitacoesPontoCard } from "@/app/portal/solicitacoes-ponto-card";
import { InstalarPwa } from "@/components/instalar-pwa";
import { sairDoPonto } from "./actions";

// A tela diária do app de ponto: saudação, o cartão de bater (o MESMO do
// portal — câmera, GPS, comprovante, tudo já testado em produção) e mais
// nada. O que não é bater ponto não entra aqui: para o colaborador este é o
// sistema de ponto, e o portal é outro sistema.
//
// A única exceção é o cartão de ajustes/abonos (21/08/2026), porque ele É
// parte de bater ponto: é o plano B de quem tentou e não conseguiu — celular,
// internet, GPS fora do raio — e precisa pedir a marcação ao RH na hora, sem
// depender de ter o portal (que exige Telegram).
export function PontoTela({ nome, empresa }: { nome: string; empresa: string }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const primeiroNome = nome.split(" ")[0];

  async function sair() {
    setSaindo(true);
    await sairDoPonto();
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Olá, {primeiroNome}!</h1>
          <p className="text-sm text-muted-foreground">{empresa}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={sair} disabled={saindo} title="Sair do ponto">
          <LogOut className="size-4" />
          {saindo ? "..." : "Sair"}
        </Button>
      </div>

      <BaterPontoCard />

      <SolicitacoesPontoCard />

      <InstalarPwa
        escopo="/ponto"
        chaveDispensa="ponto-instalar-dispensado"
        titulo="Deixe o Ponto na tela do celular"
        descricaoAndroid="Abre direto pelo ícone, pronto para bater o ponto."
      />
    </div>
  );
}
