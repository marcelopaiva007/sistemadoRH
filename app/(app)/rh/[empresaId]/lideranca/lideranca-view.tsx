"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Info,
  Network,
  UserCog,
  Users,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Indicador } from "@/components/indicador";
import {
  ROTULO_FAIXA_SPAN,
  type FaixaSpan,
  type LinhaLider,
  type MalhaDeLideranca,
} from "@/lib/lideranca";
import { cn } from "@/lib/utils";

// DUAS COLUNAS QUE ESTA TELA NÃO TEM, DE PROPÓSITO:
//
// - Turnover da equipe de cada líder. Só 1 dos 137 desligados tem supervisorId
//   gravado, então não há como atribuir uma saída a um gestor. Uma coluna de
//   turnover por líder sairia 0,0% para 16 dos 17 — leitura de "ninguém sai da
//   equipe dele" em cima de campo em branco.
// - Absenteísmo por líder. A tabela Ausencia está vazia; a taxa sairia 0,0%
//   para todo mundo, que é ausência de medição e não presença exemplar.
//
// Também não existe bloco de "líder sem nenhum liderado": `flagSemLiderados`
// hoje devolve zero linhas, e um bloco permanentemente vazio ensina o leitor a
// ignorar a área da tela onde ele está. O campo continua vindo da lib — se um
// dia aparecer gente marcada como gerente sem equipe, é aqui que entra.

const CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);

// Nomes vêm da importação em CAIXA ALTA. Mesma normalização de exibição do
// organograma — só apresentação, o dado guardado não muda.
function nomeExibicao(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, i) =>
      i > 0 && CONECTIVOS.has(parte)
        ? parte
        : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1)
    )
    .join(" ");
}

// Sobrecarga em vermelho e fragmentado em cinza: só a primeira exige decisão do
// CEO. Fragmentado é conversa de estrutura, não urgência.
const ESTILO_FAIXA: Record<
  FaixaSpan,
  { variante: "secondary" | "outline" | "destructive"; classe?: string }
> = {
  fragmentado: { variante: "secondary" },
  saudavel: { variante: "outline" },
  atencao: { variante: "outline", classe: "border-warning/40 text-warning" },
  sobrecarga: { variante: "destructive" },
};

export function LiderancaView({
  empresaId,
  malha,
  ativosPorEmpresa,
  marcas,
}: {
  empresaId: string;
  malha: MalhaDeLideranca;
  ativosPorEmpresa: { empresa: string; total: number }[];
  marcas: string[];
}) {
  // Os dois blocos do topo abrem detalhe no lugar de navegar: o número sozinho
  // ("52 sem supervisor") não diz o que fazer, e a quebra que diz — três CNPJs
  // que nunca preencheram o campo — é grande demais para caber no cartão.
  const [painel, setPainel] = useState<"cobertura" | "divergencia" | null>(null);
  const { cobertura, divergencia, concentracao } = malha;

  const headcountPorEmpresa = new Map(ativosPorEmpresa.map(e => [e.empresa, e.total]));
  const cnpjsMudos = new Set(malha.cnpjsSemNenhumaLiderancaCadastrada);
  const semSupervisorEmCnpjMudo = cobertura.semSupervisorPorEmpresa
    .filter(e => cnpjsMudos.has(e.empresa))
    .reduce((total, e) => total + e.total, 0);
  const sobrecarregados = malha.lideres.filter(l => l.faixa === "sobrecarga");
  const maiorSpan = malha.lideres[0]?.diretos ?? 0;
  const totalLiderados = malha.faixas.reduce((t, f) => t + f.liderados, 0);

  if (malha.totalAtivos === 0) {
    return (
      <div className="space-y-6">
        <Cabecalho malha={malha} marcas={marcas} />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum colaborador ativo no recorte — não há malha para medir.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Cabecalho malha={malha} marcas={marcas} />

      {malha.cnpjsNoRecorte === 1 && (
        // Vai no TOPO, não no rodapé de limitações: num recorte de um CNPJ só,
        // não é um detalhe do número — é o número inteiro que está errado. O
        // maior líder do grupo cai de 57 diretos para 7 e a tela mostra uma
        // estrutura saudável que não existe em lugar nenhum.
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-3 py-1">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Recorte de um CNPJ só — spans truncados</p>
              <p className="text-sm text-muted-foreground">
                Neste grupo a liderança atravessa CNPJ: quem lidera gente de outras empresas aparece
                aqui só com a parte da equipe que está neste cadastro. Para ver a malha real é
                preciso acesso à marca ou ao grupo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Ativos no recorte"
          valor={malha.totalAtivos}
          icone={<Users className="size-3.5" />}
          complemento={`${cobertura.comLider} com líder identificado aqui`}
        />
        <Indicador
          rotulo="Líderes"
          valor={malha.totalLideres}
          icone={<Network className="size-3.5" />}
          complemento={
            malha.totalLideres > 0
              ? `maior equipe: ${maiorSpan} diretos`
              : "ninguém aparece como supervisor"
          }
        />
        <BlocoClicavel
          rotulo="Sem supervisor"
          valor={cobertura.semSupervisor}
          icone={<UserX className="size-3.5" />}
          // O "+N com líder fora do recorte" anda colado no número porque zero
          // aqui não quer dizer "todo mundo tem líder": num recorte de um CNPJ,
          // quem reporta para fora dele sai desta conta sem sair da empresa.
          complemento={`${cobertura.pctSemSupervisor.toFixed(0)}% dos ativos, fora de qualquer equipe${
            cobertura.supervisorForaDoRecorte > 0
              ? ` · +${cobertura.supervisorForaDoRecorte} com líder fora do recorte`
              : ""
          }`}
          alerta={cobertura.semSupervisor > 0}
          aberto={painel === "cobertura"}
          onClick={() => setPainel(p => (p === "cobertura" ? null : "cobertura"))}
        />
        <BlocoClicavel
          rotulo="Divergência de cadastro"
          valor={divergencia.lideraSemFlag.length}
          icone={<UserCog className="size-3.5" />}
          complemento="lideram equipe sem estar marcados como gerente"
          alerta={divergencia.lideraSemFlag.length > 0}
          aberto={painel === "divergencia"}
          onClick={() => setPainel(p => (p === "divergencia" ? null : "divergencia"))}
        />
      </div>

      {painel === "cobertura" && (
        <PainelCobertura
          empresaId={empresaId}
          cobertura={cobertura}
          cnpjsMudos={cnpjsMudos}
          semSupervisorEmCnpjMudo={semSupervisorEmCnpjMudo}
          headcountPorEmpresa={headcountPorEmpresa}
        />
      )}

      {painel === "divergencia" && (
        <PainelDivergencia
          empresaId={empresaId}
          divergencia={divergencia}
          liderados={concentracao.liderados}
        />
      )}

      {malha.semNenhumSupervisorCadastrado && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-1">
            <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Sem base para medir span neste recorte</p>
              <p className="text-sm text-muted-foreground">
                Nenhum ativo tem supervisor cadastrado. Zero líder aqui é campo em branco, não
                estrutura horizontal — não leia como organização enxuta.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {sobrecarregados.length > 0 && (
        <DuasLeituras
          sobrecarregados={sobrecarregados}
          concentracao={concentracao}
          headcountPorEmpresa={headcountPorEmpresa}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por faixa de span</CardTitle>
          <CardDescription>
            Líderes e, ao lado, quantas pessoas estão sob eles. As duas contagens juntas porque
            separadas mentem em direções opostas: por líder a sobrecarga parece marginal, pelas
            pessoas embaixo dela é a maior parte da empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {malha.faixas.map(f => (
            <div key={f.faixa} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{f.rotulo}</span>
                <span className="text-muted-foreground tabular-nums">
                  {f.lideres} {f.lideres === 1 ? "líder" : "líderes"} ·{" "}
                  <span className="font-medium text-foreground">{f.liderados}</span>{" "}
                  {f.liderados === 1 ? "pessoa" : "pessoas"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    f.faixa === "sobrecarga" ? "bg-destructive" : "bg-primary"
                  )}
                  style={{
                    width: `${totalLiderados > 0 ? (f.liderados / totalLiderados) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}

          <p className="border-t pt-3 text-sm text-muted-foreground">
            {concentracao.informativa ? (
              <>
                Os {concentracao.topN} maiores líderes concentram{" "}
                <strong className="text-foreground">
                  {concentracao.lideradosNoTopo} dos {concentracao.liderados}
                </strong>{" "}
                liderados ({concentracao.pct.toFixed(0)}%) —{" "}
                {concentracao.lideres
                  .map(l => `${nomeExibicao(l.nome)} (${l.diretos})`)
                  .join(" e ")}
                . Risco de continuidade, não eficiência: a saída de um deles deixa metade da
                estrutura sem referência.
              </>
            ) : (
              <>
                Poucos líderes no recorte para falar em concentração — com {malha.totalLideres}{" "}
                {malha.totalLideres === 1 ? "líder" : "líderes"}, o percentual do topo seria 100%
                por construção.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Líderes e tamanho da equipe</CardTitle>
          <CardDescription>
            Reporte direto, um nível só — é a definição de span of control. Empresa, setor e cargo
            são os do cadastro do líder, não os da equipe dele: a coluna &quot;fora do CNPJ&quot; é
            justamente a distância entre as duas coisas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {malha.lideres.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum líder dentro deste recorte.
              {cobertura.supervisorForaDoRecorte > 0 &&
                ` ${cobertura.supervisorForaDoRecorte} pessoas apontam para um supervisor que está fora dele.`}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Líder</TableHead>
                    <TableHead>Empresa de cadastro</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="text-right">Diretos</TableHead>
                    <TableHead className="text-right">Fora do CNPJ</TableHead>
                    <TableHead className="text-right">CNPJs</TableHead>
                    <TableHead className="text-right">Setores</TableHead>
                    <TableHead>Faixa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {malha.lideres.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/rh/${empresaId}/colaboradores/${l.id}`}
                          className="hover:underline"
                        >
                          {nomeExibicao(l.nome)}
                        </Link>
                        {!l.gerente && (
                          <Badge variant="outline" className="ml-2 border-warning/40 text-warning">
                            sem flag de gerente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.empresa}</TableCell>
                      <TableCell className="text-muted-foreground">{l.setor}</TableCell>
                      <TableCell className="text-muted-foreground">{l.cargo}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {l.diretos}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.diretosForaDoCnpj}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.cnpjsSob}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.setoresSob}</TableCell>
                      <TableCell>
                        <Badge
                          variant={ESTILO_FAIXA[l.faixa].variante}
                          className={ESTILO_FAIXA[l.faixa].classe}
                        >
                          {ROTULO_FAIXA_SPAN[l.faixa]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Info className="size-4" />O que estes números não cobrem
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Vindos da lib, não reescritos aqui: a tela e o assistente têm que
              dizer a mesma coisa sobre o mesmo dado. */}
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {malha.avisos.map(aviso => (
              <li key={aviso} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground/60">
                  —
                </span>
                <span>{aviso}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Cabecalho({ malha, marcas }: { malha: MalhaDeLideranca; marcas: string[] }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Malha de liderança</h2>
      <p className="text-sm text-muted-foreground">
        Quantas pessoas cada líder carrega, quem está fora de qualquer equipe e onde as duas fontes
        de cadastro se contradizem. Recorte: {malha.cnpjsNoRecorte}{" "}
        {malha.cnpjsNoRecorte === 1 ? "CNPJ" : "CNPJs"}
        {marcas.length > 0 && ` · ${marcas.join(", ")}`}. Liderança neste grupo atravessa CNPJ — por
        empresa isolada, os maiores líderes apareceriam com uma fração da equipe.
      </p>
    </div>
  );
}

/** Mesmo bloco do `Indicador` plano, com afordância de clique — os quatro do topo precisam parecer a mesma peça. */
function BlocoClicavel({
  rotulo,
  valor,
  complemento,
  icone,
  alerta,
  aberto,
  onClick,
}: {
  rotulo: string;
  valor: number;
  complemento: string;
  icone: ReactNode;
  alerta: boolean;
  aberto: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      className="rounded-lg bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {rotulo}
        {aberto ? (
          <ChevronDown className="ml-auto size-3.5" />
        ) : (
          <ChevronRight className="ml-auto size-3.5" />
        )}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", alerta && "text-destructive")}>
        {valor}
      </div>
      <div className="text-xs text-muted-foreground">{complemento}</div>
    </button>
  );
}

function PainelCobertura({
  empresaId,
  cobertura,
  cnpjsMudos,
  semSupervisorEmCnpjMudo,
  headcountPorEmpresa,
}: {
  empresaId: string;
  cobertura: MalhaDeLideranca["cobertura"];
  cnpjsMudos: Set<string>;
  semSupervisorEmCnpjMudo: number;
  headcountPorEmpresa: Map<string, number>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="size-4" />
          {cobertura.semSupervisor} sem supervisor cadastrado
        </CardTitle>
        <CardDescription>
          {cnpjsMudos.size > 0 ? (
            <>
              Não é um problema difuso do grupo:{" "}
              <strong className="text-foreground">
                {semSupervisorEmCnpjMudo} dos {cobertura.semSupervisor}
              </strong>{" "}
              estão em {cnpjsMudos.size} {cnpjsMudos.size === 1 ? "CNPJ" : "CNPJs"} onde ninguém tem
              líder cadastrado — lá o campo nunca foi preenchido, e a média do recorte só está alta
              por causa deles.
            </>
          ) : (
            <>Quem não entra em nenhum span porque o campo de supervisor está em branco.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Building2 className="size-3.5" />
            Por empresa
          </p>
          <ul className="space-y-1 text-sm">
            {cobertura.semSupervisorPorEmpresa.map(e => (
              <li key={e.empresa} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {e.empresa}
                  {cnpjsMudos.has(e.empresa) && (
                    <Badge variant="secondary" className="ml-2">
                      nenhuma liderança cadastrada
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {e.total} de {headcountPorEmpresa.get(e.empresa) ?? e.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="size-3.5" />
            Por setor
          </p>
          <ul className="space-y-1 text-sm">
            {cobertura.semSupervisorPorSetor.map(s => (
              <li key={s.setor} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{s.setor}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{s.total}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          {/* O organograma é a tela onde o campo se preenche — daqui só se vê o
              buraco, lá se fecha, pessoa por pessoa e agrupado por setor. */}
          <Link
            href={`/rh/${empresaId}/organograma`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Definir líder no Organograma →
          </Link>
          {cobertura.supervisorForaDoRecorte > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Outras {cobertura.supervisorForaDoRecorte} pessoas <em>têm</em> líder, mas ele está
              fora deste recorte (desligado ou de outra marca) — não estão somadas acima, senão o
              efeito do recorte viraria falta de cadastro.
            </p>
          )}
          {cobertura.autoSupervisao > 0 && (
            <p className="mt-2 text-sm text-destructive">
              {cobertura.autoSupervisao} pessoas estão cadastradas como supervisor de si mesmas —
              erro de cadastro, ignoradas na contagem de span.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PainelDivergencia({
  empresaId,
  divergencia,
  liderados,
}: {
  empresaId: string;
  divergencia: MalhaDeLideranca["divergencia"];
  /** Pessoas com líder dentro do recorte — base para dimensionar a divergência. */
  liderados: number;
}) {
  const sobDivergentes = divergencia.lideraSemFlag.reduce((t, l) => t + l.diretos, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="size-4" />
          Lidera equipe sem estar marcado como gerente
        </CardTitle>
        <CardDescription>
          O sistema tem duas fontes sobre liderança: <strong>supervisor</strong> (a quem a pessoa
          reporta, na ficha de cada liderado) e a marca de <strong>gerente</strong> (quem avalia a
          equipe no ciclo). Divergir não é necessariamente erro — vira problema quando cai justo em
          quem carrega a estrutura. Hoje {divergencia.totalMarcadosGerente} pessoas estão marcadas
          como gerente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {divergencia.lideraSemFlag.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Todos os líderes com equipe estão marcados como gerente.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {divergencia.lideraSemFlag.map(l => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/rh/${empresaId}/colaboradores/${l.id}`}
                  className="font-medium hover:underline"
                >
                  {nomeExibicao(l.nome)}
                </Link>
                <span className="text-muted-foreground">
                  {l.cargo} · {l.empresa} — <strong className="text-foreground">{l.diretos}</strong>{" "}
                  diretos em {l.cnpjsSob} {l.cnpjsSob === 1 ? "CNPJ" : "CNPJs"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {divergencia.lideraSemFlag.length > 0 && liderados > 0 && (
          // O tamanho é o que transforma a divergência de detalhe de cadastro em
          // assunto de Diretoria: a marca de gerente é o que define quem avalia
          // no ciclo, então quem está fora dela não avalia ninguém.
          <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
            Juntos, esses {divergencia.lideraSemFlag.length} carregam{" "}
            <strong className="text-foreground">
              {sobDivergentes} dos {liderados}
            </strong>{" "}
            liderados do recorte ({Math.round((sobDivergentes / liderados) * 100)}%). Ou a marca de
            gerente ficou para trás, ou o supervisor é que está errado — as duas hipóteses se
            confirmam com o RH, não aqui.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * O mesmo dado admite duas leituras que pedem ações opostas — reorganizar a
 * empresa ou corrigir a importação. Mostrar só uma delas seria escolher pelo
 * CEO com base em palpite, então a tela apresenta as duas com a evidência de
 * cada uma e diz qual campo desempata.
 */
function DuasLeituras({
  sobrecarregados,
  concentracao,
  headcountPorEmpresa,
}: {
  sobrecarregados: LinhaLider[];
  concentracao: MalhaDeLideranca["concentracao"];
  headcountPorEmpresa: Map<string, number>;
}) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          {sobrecarregados.length === 1
            ? "1 líder acima de 15 diretos"
            : `${sobrecarregados.length} líderes acima de 15 diretos`}
        </CardTitle>
        <CardDescription>
          Duas leituras cabem neste mesmo número, e elas pedem ações opostas. Antes de reorganizar
          gente, vale saber em qual delas se está.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {sobrecarregados.map(l => {
            const doCnpj = headcountPorEmpresa.get(l.empresa);
            return (
              <li key={l.id} className="rounded-md bg-muted/40 px-3 py-2">
                <span className="font-medium">{nomeExibicao(l.nome)}</span>{" "}
                <span className="text-muted-foreground">
                  — {l.cargo}, {l.empresa}
                  {doCnpj !== undefined && ` (${doCnpj} ativos)`}
                </span>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">{l.diretos} diretos</strong>, sendo{" "}
                  {l.diretosForaDoCnpj} fora do CNPJ dele, espalhados por {l.cnpjsSob}{" "}
                  {l.cnpjsSob === 1 ? "CNPJ" : "CNPJs"} e {l.setoresSob}{" "}
                  {l.setoresSob === 1 ? "setor" : "setores"}
                  {!l.gerente && " · não está marcado como gerente"}.
                </p>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">1. A estrutura é real e está sobrecarregada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {concentracao.informativa ? (
                <>
                  {concentracao.lideradosNoTopo} das {concentracao.liderados} pessoas com líder
                  dependem de {concentracao.topN}. Nesse tamanho não existe acompanhamento
                  individual, avaliação de ciclo nem substituição planejada.
                </>
              ) : (
                <>
                  Nesse tamanho de equipe não existe acompanhamento individual, avaliação de ciclo
                  nem substituição planejada.
                </>
              )}{" "}
              <strong className="text-foreground">Ação:</strong> criar camada intermediária e
              redistribuir.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">2. O cadastro é que está errado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Equipe muito maior que o CNPJ de origem, espalhada por várias empresas e setores, é o
              desenho típico de um supervisor preenchido por padrão na importação — não de uma
              equipe montada. <strong className="text-foreground">Ação:</strong> conferir a origem
              do campo com o RH antes de mexer em qualquer estrutura.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          O cargo cadastrado é o que desempata: cargo de supervisão com equipe grande é estrutura
          plausível; cargo de execução com equipe grande é quase sempre preenchimento padrão. Nos
          dois casos o próximo passo é o mesmo — confirmar com o RH a quem essas pessoas reportam de
          fato.
        </p>
      </CardContent>
    </Card>
  );
}
