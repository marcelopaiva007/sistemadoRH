"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buscarColaboradoresParaVincular,
  vincularColaboradorAoUsuario,
  desvincularColaboradorDoUsuario,
} from "@/lib/actions/usuarios";
import type { FichaDoUsuario, Usuario } from "./usuarios-table";

type Achado = { id: string; nome: string; empresaNome: string; setorNome: string };

// Aponta qual pessoa da folha é este login.
//
// Isto NÃO é acesso — os vínculos de empresa e marca, logo abaixo no mesmo
// diálogo, continuam mandando em onde o usuário mexe. Aqui a pergunta é outra:
// QUEM ele é. Sem esta resposta, uma tela com login não consegue mostrar "meu
// time", porque time sai de `Colaborador.supervisorId` e o login não chegava
// até a ficha.
//
// Busca em vez de lista: são centenas de fichas ativas, e um select com todas
// não se navega. O mínimo de 2 letras é do servidor, não daqui.
export function FichaVinculada({
  usuario,
  onSuccess,
}: {
  usuario: Usuario;
  onSuccess: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [buscando, startBusca] = useTransition();
  const [salvando, startSalvar] = useTransition();

  function buscar() {
    if (termo.trim().length < 2) {
      toast.error("Digite ao menos 2 letras do nome, ou parte do CPF.");
      return;
    }
    startBusca(async () => {
      setAchados(await buscarColaboradoresParaVincular(usuario.id, termo));
    });
  }

  function vincular(ficha: Achado) {
    startSalvar(async () => {
      const r = await vincularColaboradorAoUsuario(usuario.id, ficha.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Login ligado à ficha de ${ficha.nome}.`);
      setAchados(null);
      setTermo("");
      onSuccess();
    });
  }

  function desvincular() {
    startSalvar(async () => {
      const r = await desvincularColaboradorDoUsuario(usuario.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Vínculo com a ficha removido.");
      onSuccess();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Ficha de colaborador</Label>
        <p className="text-xs text-muted-foreground">
          Quem é esta pessoa na folha. É o que permite a ela ver o próprio time
          nas telas do sistema. Opcional — quem é só do RH normalmente não tem
          ficha na empresa que administra.
        </p>
      </div>

      {usuario.ficha ? (
        <FichaAtual ficha={usuario.ficha} onRemover={desvincular} removendo={salvando} />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // Sem isto o Enter submeteria o formulário de vínculo de
                  // empresa que existe logo abaixo, no mesmo diálogo.
                  e.preventDefault();
                  buscar();
                }
              }}
              placeholder="Nome ou CPF do colaborador"
            />
            <Button type="button" variant="secondary" onClick={buscar} disabled={buscando}>
              <Search className="size-4" />
              {buscando ? "Buscando…" : "Buscar"}
            </Button>
          </div>

          {achados?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma ficha encontrada. A busca só mostra colaboradores ativos,
              dentro das empresas que este usuário acessa e que ainda não têm
              login próprio.
            </p>
          )}

          {achados && achados.length > 0 && (
            <ul className="divide-y rounded-md border">
              {achados.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.empresaNome} · {c.setorNome}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => vincular(c)}
                    disabled={salvando}
                  >
                    Vincular
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FichaAtual({
  ficha,
  onRemover,
  removendo,
}: {
  ficha: FichaDoUsuario;
  onRemover: () => void;
  removendo: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{ficha.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ficha.empresaNome} · {ficha.setorNome}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemover}
        disabled={removendo}
        title="Desvincular ficha"
      >
        <X className="size-4" />
        Desvincular
      </Button>
    </div>
  );
}
