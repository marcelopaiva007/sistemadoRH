"use client";

import { useRouter } from "next/navigation";
import { decidirFerias } from "@/lib/actions/rh-ferias";
import { decidirAusencia } from "@/lib/actions/rh-ausencias";
import { conferirDocumento, devolverDocumento } from "@/lib/actions/rh-documentos-conferencia";
import { decidirTratamentoPonto } from "@/app/actions/rh-ponto";
import { tipoAusenciaLabel, tipoDocumentoLabel } from "@/lib/constants-dp";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { FilaDeDecisao, type ItemDeDecisao } from "@/components/padroes/fila-de-decisao";
import { tipoTratamentoLabel, tipoMarcacaoLabel } from "@/lib/constants-ponto";
import { formatarTamanho } from "@/lib/anexos";
import { formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";
import { AjudaDaTela } from "@/components/ajuda-da-tela";

type Ferias = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  diasAbono: number;
  observacoes: string | null;
  solicitadoPorNome: string | null;
  createdAt: Date;
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

type Ausencia = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  dias: number;
  abonada: boolean;
  observacoes: string | null;
  registradoPorNome: string | null;
  createdAt: Date;
  arquivo: { id: string; nome: string } | null;
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

type Documento = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  tipo: string;
  descricao: string | null;
  emitidoEm: Date | null;
  validoAte: Date | null;
  observacoes: string | null;
  createdAt: Date;
  arquivo: { id: string; nome: string; tamanhoBytes: number } | null;
  colaborador: {
    nome: string;
    cpf: string | null;
    rg: string | null;
    rgOrgaoEmissor: string | null;
    rgUf: string | null;
    pis: string | null;
    ctpsNumero: string | null;
    ctpsSerie: string | null;
    ctpsUf: string | null;
    tituloEleitor: string | null;
    setor: { nome: string };
    empresa: { nome: string };
  };
};

type Decidida = {
  id: string;
  acao: string;
  resumo: string;
  usuarioNome: string | null;
  createdAt: Date;
};

type TratamentoPonto = {
  id: string;
  empresaId: string;
  colaboradorId: string;
  tipo: string;
  dataFato: Date;
  motivo: string;
  origem: string;
  tipoMarcacao: string | null;
  horaSolicitada: string | null;
  createdAt: Date;
  colaborador: { nome: string; setor: { nome: string }; empresa: { nome: string } };
};

// Os rótulos de tipo eram uma cópia local dos da aba Tratamento — desde
// 21/08/2026 a lista única mora em lib/constants-ponto.ts.

/**
 * O que a pessoa digitou para o tipo de documento que anexou. É contra isto que
 * o RH compara a foto — sem, a conferência vira "parece um RG mesmo".
 */
function numeroDeclarado(d: Documento): string | null {
  const c = d.colaborador;
  const junta = (...partes: (string | null)[]) => partes.filter(Boolean).join(" · ") || null;
  switch (d.tipo) {
    case "RG":
      return junta(c.rg && `RG ${c.rg}`, c.rgOrgaoEmissor, c.rgUf);
    case "CPF":
      return c.cpf && `CPF ${c.cpf}`;
    case "CTPS":
      return junta(c.ctpsNumero && `CTPS ${c.ctpsNumero}`, c.ctpsSerie && `série ${c.ctpsSerie}`, c.ctpsUf);
    case "TITULO_ELEITOR":
      return c.tituloEleitor && `Título ${c.tituloEleitor}`;
    default:
      return null;
  }
}

export function AprovacoesView({
  ferias,
  ausencias,
  documentos,
  decididasRecentes,
  tratamentosPonto,
}: {
  ferias: Ferias[];
  ausencias: Ausencia[];
  documentos: Documento[];
  decididasRecentes: Decidida[];
  tratamentosPonto: TratamentoPonto[];
}) {
  const router = useRouter();

  // A lista pode misturar CNPJs (empresasVisiveis + filtro `?empresas=` da
  // barra de topo, não só o CNPJ da rota) — mostra o nome da empresa sempre,
  // sem condicional: o CNPJ "da rota" não é mais referência confiável do que
  // "a pessoa está vendo", já que agora pode estar filtrado.
  const contexto = (setor: string, empresa: string) => `${setor} · ${empresa}`;
  const feito = (r: ActionResult) => {
    if (r.ok) router.refresh();
    return r;
  };

  // As quatro filas viram UMA, ordenada pela espera: o item mais antigo é o
  // primeiro da tela, não o primeiro do quarto cartão. O tipo continua
  // visível na etiqueta e vira o filtro segmentado do cabeçalho.
  const itens: ItemDeDecisao[] = [
    ...ferias.map((f) => ({
      id: f.id,
      tipo: "ferias",
      etiqueta: "Férias",
      desde: f.createdAt,
      quem: f.colaborador.nome,
      quemHref: `/rh/${f.empresaId}/colaboradores/${f.colaboradorId}`,
      contexto: contexto(f.colaborador.setor.nome, f.colaborador.empresa.nome),
      oQue: `${formatarData(f.dataInicio)} a ${formatarData(f.dataFim)} · ${f.dias} dia(s)${f.diasAbono ? ` + ${f.diasAbono} de abono` : ""}`,
      detalhes: [
        f.observacoes,
        `Solicitado por ${f.solicitadoPorNome ?? "—"} em ${formatarDataHoraBrasilia(f.createdAt)}`,
      ],
      onDecidir: async (decisao: "APROVADA" | "REPROVADA", motivo?: string) =>
        feito(await decidirFerias(f.empresaId, f.id, decisao, motivo)),
    })),
    // Chegou do portal e ainda não passou por ninguém. Abrir o anexo é o
    // trabalho: o que o colaborador digitou pode não bater com a foto.
    ...documentos.map((d) => ({
      id: d.id,
      tipo: "documentos",
      etiqueta: tipoDocumentoLabel(d.tipo),
      desde: d.createdAt,
      quem: d.colaborador.nome,
      quemHref: `/rh/${d.empresaId}/colaboradores/${d.colaboradorId}`,
      contexto: contexto(d.colaborador.setor.nome, d.colaborador.empresa.nome),
      // O número que a pessoa digitou, para bater com a foto.
      oQue: numeroDeclarado(d) ?? "Sem número digitado para este documento.",
      detalhes: [
        d.descricao,
        d.validoAte ? `Válido até ${formatarData(d.validoAte)}` : null,
        d.observacoes,
        `Enviado em ${formatarDataHoraBrasilia(d.createdAt)}`,
      ],
      anexo: d.arquivo
        ? {
            href: `/api/rh/${d.empresaId}/arquivos/${d.arquivo.id}`,
            nome: `${d.arquivo.nome} · ${formatarTamanho(d.arquivo.tamanhoBytes)}`,
          }
        : null,
      rotuloAprovar: "Conferir",
      rotuloReprovar: "Devolver",
      // Devolver sem dizer o porquê faz a pessoa reenviar a mesma foto.
      motivoObrigatorio: true,
      onDecidir: async (decisao: "APROVADA" | "REPROVADA", motivo?: string) =>
        feito(
          decisao === "APROVADA"
            ? await conferirDocumento(d.empresaId, d.id)
            : await devolverDocumento(d.empresaId, d.id, motivo ?? ""),
        ),
    })),
    ...ausencias.map((a) => ({
      id: a.id,
      tipo: "ausencias",
      etiqueta: tipoAusenciaLabel(a.tipo),
      desde: a.createdAt,
      quem: a.colaborador.nome,
      quemHref: `/rh/${a.empresaId}/colaboradores/${a.colaboradorId}`,
      contexto: contexto(a.colaborador.setor.nome, a.colaborador.empresa.nome),
      oQue: `${formatarData(a.dataInicio)} a ${formatarData(a.dataFim)} · ${a.dias} dia(s)${a.abonada ? " · abonada" : " · não abonada"}`,
      detalhes: [
        a.observacoes,
        `Registrado por ${a.registradoPorNome ?? "—"} em ${formatarDataHoraBrasilia(a.createdAt)}`,
      ],
      anexo: a.arquivo
        ? { href: `/api/rh/${a.empresaId}/arquivos/${a.arquivo.id}`, nome: a.arquivo.nome }
        : null,
      rotuloAprovar: "Validar",
      onDecidir: async (decisao: "APROVADA" | "REPROVADA", motivo?: string) =>
        feito(await decidirAusencia(a.empresaId, a.id, decisao, motivo)),
    })),
    ...tratamentosPonto.map((t) => ({
      id: t.id,
      tipo: "ponto",
      etiqueta: tipoTratamentoLabel(t.tipo),
      desde: t.createdAt,
      quem: t.colaborador.nome,
      quemHref: `/rh/${t.empresaId}/colaboradores/${t.colaboradorId}`,
      contexto: contexto(t.colaborador.setor.nome, t.colaborador.empresa.nome),
      oQue: `Ocorrência em ${formatarData(t.dataFato)}${
        t.tipoMarcacao && t.horaSolicitada
          ? ` — ${tipoMarcacaoLabel(t.tipoMarcacao)} às ${t.horaSolicitada}`
          : ""
      }`,
      detalhes: [
        t.motivo,
        `Aberto em ${formatarDataHoraBrasilia(t.createdAt)}${t.origem === "COLABORADOR" ? " · pedido pelo colaborador" : ""}`,
      ],
      // Rejeitar um ajuste de ponto sem dizer por quê deixa o colaborador sem
      // saber o que corrigir — e a action recusa motivo com menos de 5
      // caracteres de qualquer forma.
      motivoObrigatorio: true,
      rotuloReprovar: "Rejeitar",
      onDecidir: async (decisao: "APROVADA" | "REPROVADA", motivo?: string) =>
        feito(
          await decidirTratamentoPonto({
            empresaId: t.empresaId,
            tratamentoId: t.id,
            decisao: decisao === "APROVADA" ? "APROVADO" : "REJEITADO",
            motivoDecisao: motivo,
          }),
        ),
    })),
  ].sort((a, b) => a.desde.getTime() - b.desde.getTime());

  const maisAntigo = itens[0];

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Central de aprovações
            <AjudaDaTela modulo="aprovacoes" />
          </span>
        }
        resumo={
          itens.length === 0
            ? "Nada esperando decisão no momento."
            : `${itens.length} solicitaç${itens.length > 1 ? "ões aguardando" : "ão aguardando"} decisão${
                maisAntigo ? ` — a mais antiga desde ${formatarData(maisAntigo.desde)}` : ""
              }.`
        }
      />

      <FilaDeDecisao
        itens={itens}
        tipos={[
          { valor: "ferias", label: "Férias" },
          { valor: "documentos", label: "Documentos" },
          { valor: "ausencias", label: "Ausências" },
          { valor: "ponto", label: "Ponto" },
        ]}
        lateral={
          <div className="space-y-6">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
                Decisões recentes
              </h2>
              {decididasRecentes.length === 0 ? (
                <p className="py-3 text-[12.5px] text-muted-foreground">
                  Nenhuma decisão registrada ainda.
                </p>
              ) : (
                <ul className="mt-2">
                  {decididasRecentes.map((d) => (
                    <li key={d.id} className="border-b border-border py-2 last:border-0">
                      <p className="text-[13px]">{d.resumo}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {d.usuarioNome ?? "—"} · {formatarDataHoraBrasilia(d.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-card p-3">
              <h2 className="text-[11px] font-semibold tracking-[.08em] text-primary uppercase">
                Recusa sempre pede motivo
              </h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                O motivo vai para o colaborador pelo Telegram e fica na trilha de auditoria.
                Documento devolvido apaga o arquivo e pede reenvio; ajuste de ponto rejeitado
                precisa dizer o que corrigir. Aprovar é um clique.
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}
