import { requireAreaAdmin } from "@/lib/grupo-guard";
import { prisma } from "@/lib/prisma";
import { LIMITE_DIARIO_ENVIOS } from "@/lib/constants-rh";
import {
  ORIGENS_EMAIL,
  STATUS_LOG_EMAIL,
  ROTULO_ORIGEM_EMAIL,
  ROTULO_STATUS_EMAIL,
  type OrigemEmail,
  type StatusLogEmail,
  inicioDoDiaSaoPaulo,
  intervaloBrasiliaParaDate,
  formatarDataHoraBrasilia,
} from "@/lib/email";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  Filter,
  Mail,
  RotateCcw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

function hojeBrasiliaYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function subtrairDiasYmd(ymd: string, dias: number): string {
  const [ano, mes, dia] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia - dias, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function badgeStatus(status: string) {
  switch (status) {
    case "ENVIADO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="size-3 text-emerald-600" />
          Enviado
        </span>
      );
    case "BLOQUEADO_TETO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <AlertTriangle className="size-3 text-amber-600" />
          Teto Atingido
        </span>
      );
    case "SUPRIMIDO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
          <ShieldAlert className="size-3 text-purple-600" />
          Suprimido
        </span>
      );
    case "INVALIDO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <XCircle className="size-3 text-rose-600" />
          Inválido
        </span>
      );
    case "FALHOU":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
          <XCircle className="size-3 text-red-600" />
          Falha
        </span>
      );
  }
}

type Props = {
  searchParams: Promise<{
    inicio?: string;
    fim?: string;
    status?: string;
    origem?: string;
    marca?: string;
    q?: string;
  }>;
};

export default async function LogsEmailPage({ searchParams }: Props) {
  await requireAreaAdmin();

  const params = await searchParams;
  const hoje = hojeBrasiliaYmd();
  const inicioParam = params.inicio || subtrairDiasYmd(hoje, 1);
  const fimParam = params.fim || hoje;
  const statusParam = params.status || "";
  const origemParam = params.origem || "";
  const marcaParam = params.marca?.trim() || "";
  const qParam = params.q?.trim() || "";

  const [dataInicio, dataFimExclusivo] = intervaloBrasiliaParaDate(inicioParam, fimParam);
  const inicioHojeBrasilia = inicioDoDiaSaoPaulo();

  // Filtro principal da tabela
  const where: Prisma.EmailEnviadoWhereInput = {
    enviadoEm: {
      gte: dataInicio,
      lt: dataFimExclusivo,
    },
    ...(statusParam ? { status: statusParam } : {}),
    ...(origemParam ? { origem: origemParam } : {}),
    ...(marcaParam ? { marcaNome: { contains: marcaParam, mode: "insensitive" } } : {}),
    ...(qParam
      ? {
          OR: [
            { para: { contains: qParam, mode: "insensitive" } },
            { assunto: { contains: qParam, mode: "insensitive" } },
            { erro: { contains: qParam, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Consultas de agregação e listagem
  const [enviadosHoje, bloqueadosHoje, totalNoFiltro, falhasNoFiltro, logs] = await Promise.all([
    prisma.emailEnviado.count({
      where: { ok: true, enviadoEm: { gte: inicioHojeBrasilia } },
    }),
    prisma.emailEnviado.count({
      where: { status: "BLOQUEADO_TETO", enviadoEm: { gte: inicioHojeBrasilia } },
    }),
    prisma.emailEnviado.count({ where }),
    prisma.emailEnviado.count({
      where: { ...where, ok: false },
    }),
    prisma.emailEnviado.findMany({
      where,
      orderBy: { enviadoEm: "desc" },
      take: 250,
    }),
  ]);

  const saldoHoje = Math.max(0, LIMITE_DIARIO_ENVIOS - enviadosHoje);
  const pctUsoHoje = Math.min(100, Math.round((enviadosHoje / LIMITE_DIARIO_ENVIOS) * 100));

  // Query string para exportação CSV mantendo todos os filtros
  const csvParams = new URLSearchParams();
  if (inicioParam) csvParams.set("inicio", inicioParam);
  if (fimParam) csvParams.set("fim", fimParam);
  if (statusParam) csvParams.set("status", statusParam);
  if (origemParam) csvParams.set("origem", origemParam);
  if (marcaParam) csvParams.set("marca", marcaParam);
  if (qParam) csvParams.set("q", qParam);
  const csvUrl = `/api/admin/logs-email/csv?${csvParams.toString()}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Logs de Disparo SMTP</h1>
          <p className="text-sm text-slate-500">
            Rastreamento completo de todos os e-mails enviados pelo sistema, auditoria de falhas e consumo da cota.
          </p>
        </div>
        <div>
          <a
            href={csvUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
          >
            <Download className="size-4" />
            Exportar CSV
          </a>
        </div>
      </div>

      {/* Cards de Métricas (KPIs) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cota Diária Hoje */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Enviados Hoje (Brasília)
            </span>
            <Mail className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{enviadosHoje}</span>
            <span className="text-sm font-medium text-slate-500">/ {LIMITE_DIARIO_ENVIOS}</span>
          </div>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all ${
                  pctUsoHoje >= 90 ? "bg-red-500" : pctUsoHoje >= 75 ? "bg-amber-500" : "bg-blue-600"
                }`}
                style={{ width: `${pctUsoHoje}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">{saldoHoje} envios restantes hoje ({pctUsoHoje}% usado)</p>
          </div>
        </div>

        {/* Bloqueados Hoje */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Bloqueados pelo Teto Hoje
            </span>
            <AlertTriangle className="size-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <span className={`text-3xl font-extrabold ${bloqueadosHoje > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {bloqueadosHoje}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {bloqueadosHoje > 0
              ? "Envios recusados após atingir o limite diário"
              : "Nenhum bloqueio por teto hoje"}
          </p>
        </div>

        {/* Falhas no Período */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Falhas no Filtro
            </span>
            <XCircle className="size-4 text-red-600" />
          </div>
          <div className="mt-2">
            <span className={`text-3xl font-extrabold ${falhasNoFiltro > 0 ? "text-red-600" : "text-slate-900"}`}>
              {falhasNoFiltro}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">Falhas SMTP, e-mails inválidos ou suprimidos</p>
        </div>

        {/* Total no Filtro */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total no Filtro
            </span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold text-slate-900">{totalNoFiltro}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">Disparos registrados no período selecionado</p>
        </div>
      </div>

      {/* Nota Explicativa do Teto */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-xs text-blue-900">
        <p className="font-semibold">Regra de Orçamento e Teto Global:</p>
        <p className="mt-0.5 text-blue-800 leading-relaxed">
          O teto diário de <b>{LIMITE_DIARIO_ENVIOS} e-mails</b> é compartilhado globalmente entre todas as empresas e
          marcas do sistema. A contagem reinicia diariamente à <b>00:00 no horário de Brasília (03:00 UTC)</b>.
          Falhas de rede, conexões recusadas, endereços inválidos ou suprimidos gravam log forense com <code>ok = false</code> e{" "}
          <b>não consomem</b> o saldo da cota diária.
        </p>
      </div>

      {/* Filtros de Busca */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {/* Início */}
            <div>
              <label htmlFor="inicio" className="block text-xs font-medium text-slate-700">
                Início (Brasília)
              </label>
              <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <Calendar className="mr-2 size-3.5 text-slate-400" />
                <input
                  type="date"
                  id="inicio"
                  name="inicio"
                  defaultValue={inicioParam}
                  className="w-full text-xs text-slate-800 outline-none"
                />
              </div>
            </div>

            {/* Fim */}
            <div>
              <label htmlFor="fim" className="block text-xs font-medium text-slate-700">
                Fim (Brasília)
              </label>
              <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <Calendar className="mr-2 size-3.5 text-slate-400" />
                <input
                  type="date"
                  id="fim"
                  name="fim"
                  defaultValue={fimParam}
                  className="w-full text-xs text-slate-800 outline-none"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-xs font-medium text-slate-700">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={statusParam}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos os status</option>
                {STATUS_LOG_EMAIL.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_EMAIL[s as StatusLogEmail] ?? s}
                  </option>
                ))}
              </select>
            </div>

            {/* Origem */}
            <div>
              <label htmlFor="origem" className="block text-xs font-medium text-slate-700">
                Origem / Módulo
              </label>
              <select
                id="origem"
                name="origem"
                defaultValue={origemParam}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todas as origens</option>
                {ORIGENS_EMAIL.map((o) => (
                  <option key={o} value={o}>
                    {ROTULO_ORIGEM_EMAIL[o as OrigemEmail] ?? o}
                  </option>
                ))}
              </select>
            </div>

            {/* Marca */}
            <div>
              <label htmlFor="marca" className="block text-xs font-medium text-slate-700">
                Marca / Empresa
              </label>
              <input
                type="text"
                id="marca"
                name="marca"
                defaultValue={marcaParam}
                placeholder="Ex: LM Telecom"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Busca textual */}
            <div>
              <label htmlFor="q" className="block text-xs font-medium text-slate-700">
                Destinatário / Assunto
              </label>
              <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                <Search className="mr-2 size-3.5 text-slate-400" />
                <input
                  type="text"
                  id="q"
                  name="q"
                  defaultValue={qParam}
                  placeholder="E-mail ou texto..."
                  className="w-full text-xs text-slate-800 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <a
              href="/admin/logs-email"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Limpar Filtros
            </a>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Filter className="size-3.5" />
              Filtrar Logs
            </button>
          </div>
        </form>
      </div>

      {/* Tabela de Resultados */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Data/Hora (BRT)</th>
                <th className="px-4 py-3 whitespace-nowrap">Destinatário</th>
                <th className="px-4 py-3 whitespace-nowrap">Origem</th>
                <th className="px-4 py-3">Assunto</th>
                <th className="px-4 py-3 whitespace-nowrap">Marca / Empresa</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3">Detalhes / Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <Mail className="mx-auto size-8 text-slate-300" />
                    <p className="mt-2 font-medium">Nenhum log de e-mail encontrado para o período e filtros selecionados.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const status = log.status ?? (log.ok ? "ENVIADO" : "FALHOU");
                  const rotuloOrigem = log.origem
                    ? ROTULO_ORIGEM_EMAIL[log.origem as OrigemEmail] ?? log.origem
                    : "Legado";

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap text-slate-700">
                        {formatarDataHoraBrasilia(log.enviadoEm)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {log.para}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {rotuloOrigem}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-800" title={log.assunto}>
                        {log.assunto}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {log.marcaNome || log.empresaId ? (
                          <span>
                            {log.marcaNome ?? "—"}
                            {log.empresaId ? (
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {log.empresaId}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{badgeStatus(status)}</td>
                      <td className="px-4 py-3 max-w-sm text-slate-500">
                        {log.erro ? (
                          <span className="text-red-700 block text-[11px] leading-tight" title={log.erro}>
                            {log.erro}
                          </span>
                        ) : log.chave ? (
                          <span className="text-[10px] text-slate-400 font-mono block truncate" title={log.chave}>
                            chave: {log.chave}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé informativo de paginação/limite */}
        {totalNoFiltro > 250 ? (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            Exibindo os primeiros <b>250 registros</b> mais recentes de um total de <b>{totalNoFiltro}</b>.
            Para acessar a lista integral, utilize o botão <b>Exportar CSV</b> no canto superior direito.
          </div>
        ) : null}
      </div>
    </div>
  );
}
