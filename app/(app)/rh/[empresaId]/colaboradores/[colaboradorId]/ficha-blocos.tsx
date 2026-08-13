"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { atualizarFicha } from "@/lib/actions/rh-ficha";
import {
  ESCOLARIDADES,
  ESTADOS_CIVIS,
  MOTIVOS_DESLIGAMENTO,
  TIPOS_CONTRATO,
} from "@/lib/constants-dp";
import { Campo, CampoData, CampoSelect, CampoTexto, FormularioAction } from "./campos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatarCpf } from "@/lib/cpf";

// A ficha é dividida em blocos e cada bloco posta só os seus campos — a action
// grava apenas o que veio no FormData, então um bloco nunca apaga o outro.

type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  sexo: string | null;
  dataNascimento: Date | null;
  cidade: string | null;
  matricula: string | null;
  rg: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  pis: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  tituloEleitor: string | null;
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
  uf: string | null;
  emergenciaNome: string | null;
  emergenciaParentesco: string | null;
  emergenciaTelefone: string | null;
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  motivoDesligamento: string | null;
  tipoContrato: string | null;
  dataFimContrato: Date | null;
  jornadaSemanal: number | null;
  salarioBase: number | null;
  setorId: string;
  posicaoId: string;
  supervisorId: string | null;
  setor: { id: string; nome: string };
  posicao: { id: string; nome: string };
  supervisor: { id: string; nome: string } | null;
};

const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * As listas de setor/cargo vêm filtradas por `ativo: true`. Se a pessoa está
 * hoje num setor desativado, ele não estaria entre as opções e o <select>
 * abriria mostrando outro setor — o RH salvaria uma mudança que não pediu.
 * Garantir o atual na lista evita isso.
 */
function comAtual(
  opcoes: { id: string; nome: string }[],
  atual: { id: string; nome: string },
): { value: string; label: string }[] {
  const lista = opcoes.some((o) => o.id === atual.id) ? opcoes : [atual, ...opcoes];
  return lista.map((o) => ({ value: o.id, label: o.nome }));
}

const SEXOS = [
  { value: "Masculino", label: "Masculino" },
  { value: "Feminino", label: "Feminino" },
  { value: "Outro", label: "Outro" },
] as const;

function Bloco({
  titulo,
  descricao,
  children,
  acao,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  acao: (prev: import("@/lib/constants").ActionResult, fd: FormData) => Promise<import("@/lib/constants").ActionResult>;
}) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        <FormularioAction
          action={acao}
          mensagemSucesso="Ficha atualizada."
          onSuccess={() => router.refresh()}
        >
          {children}
        </FormularioAction>
      </CardContent>
    </Card>
  );
}

// Salário e dados bancários aparecem sem condicional porque a própria rota já
// é restrita: requireEmpresaAccess só deixa passar ADMIN e o RH_MANAGER da
// empresa (DIRETORIA e GESTOR_SETOR são redirecionados antes de chegar aqui).
export function FichaBlocos({
  empresaId,
  colaborador,
  setores,
  posicoes,
  candidatosSupervisor,
}: {
  empresaId: string;
  colaborador: Colaborador;
  setores: { id: string; nome: string }[];
  posicoes: { id: string; nome: string }[];
  candidatosSupervisor: { id: string; nome: string }[];
}) {
  const acao = atualizarFicha.bind(null, empresaId, colaborador.id);
  const c = colaborador;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco
        titulo="Estrutura"
        descricao="Onde a pessoa está hoje. Corrija aqui o cadastro; promoção ou transferência com histórico é na aba Carreira."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            name="setorId"
            label="Setor"
            opcoes={comAtual(setores, c.setor)}
            defaultValue={c.setorId}
            placeholder="Selecione o setor"
            required
          />
          <CampoSelect
            name="posicaoId"
            label="Cargo"
            opcoes={comAtual(posicoes, c.posicao)}
            defaultValue={c.posicaoId}
            placeholder="Selecione o cargo"
            required
          />
          <Campo label="Reporta a" className="sm:col-span-2">
            {/* Sem CampoSelect: aqui a opção vazia é um valor de verdade
                ("sem líder"), não um placeholder a ser rejeitado. */}
            <select name="supervisorId" defaultValue={c.supervisorId ?? ""} className={classeSelect}>
              <option value="">Sem líder</option>
              {(c.supervisor && !candidatosSupervisor.some((s) => s.id === c.supervisor!.id)
                ? [c.supervisor, ...candidatosSupervisor]
                : candidatosSupervisor
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </Bloco>

      <Bloco titulo="Identificação" acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="nome" label="Nome completo" defaultValue={c.nome} required className="sm:col-span-2" />
          <CampoTexto name="cpf" label="CPF" defaultValue={c.cpf} placeholder="Somente números" maxLength={14} />
          <CampoTexto name="matricula" label="Matrícula" defaultValue={c.matricula} />
          <CampoData name="dataNascimento" label="Nascimento" defaultValue={c.dataNascimento} />
          <CampoSelect name="sexo" label="Sexo" opcoes={SEXOS} defaultValue={c.sexo} />
          <CampoSelect name="estadoCivil" label="Estado civil" opcoes={ESTADOS_CIVIS} defaultValue={c.estadoCivil} />
          <CampoSelect name="escolaridade" label="Escolaridade" opcoes={ESCOLARIDADES} defaultValue={c.escolaridade} />
          <CampoTexto name="email" label="E-mail" type="email" defaultValue={c.email} />
          <CampoTexto name="telefone" label="Telefone" defaultValue={c.telefone} />
          <CampoTexto name="nomeMae" label="Nome da mãe" defaultValue={c.nomeMae} />
          <CampoTexto name="nomePai" label="Nome do pai" defaultValue={c.nomePai} />
          <CampoTexto name="nacionalidade" label="Nacionalidade" defaultValue={c.nacionalidade} />
          <CampoTexto name="naturalidade" label="Naturalidade" defaultValue={c.naturalidade} />
        </div>
      </Bloco>

      <Bloco titulo="Documentos" descricao="Números dos documentos. As cópias digitalizadas ficam na aba Dossiê." acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="rg" label="RG" defaultValue={c.rg} />
          <CampoTexto name="rgOrgaoEmissor" label="Órgão emissor" defaultValue={c.rgOrgaoEmissor} />
          <CampoTexto name="rgUf" label="UF do RG" defaultValue={c.rgUf} maxLength={2} />
          <CampoTexto name="pis" label="PIS/PASEP" defaultValue={c.pis} />
          <CampoTexto name="ctpsNumero" label="CTPS — número" defaultValue={c.ctpsNumero} />
          <CampoTexto name="ctpsSerie" label="CTPS — série" defaultValue={c.ctpsSerie} />
          <CampoTexto name="ctpsUf" label="CTPS — UF" defaultValue={c.ctpsUf} maxLength={2} />
          <CampoTexto name="tituloEleitor" label="Título de eleitor" defaultValue={c.tituloEleitor} />
        </div>
      </Bloco>

      <Bloco titulo="Endereço" acao={acao}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="cep" label="CEP" defaultValue={c.cep} maxLength={9} />
          <CampoTexto name="logradouro" label="Logradouro" defaultValue={c.logradouro} />
          <CampoTexto name="numeroEndereco" label="Número" defaultValue={c.numeroEndereco} />
          <CampoTexto name="complemento" label="Complemento" defaultValue={c.complemento} />
          <CampoTexto name="bairro" label="Bairro" defaultValue={c.bairro} />
          <CampoTexto name="cidade" label="Cidade" defaultValue={c.cidade} />
          <CampoTexto name="uf" label="UF" defaultValue={c.uf} maxLength={2} />
        </div>
      </Bloco>

      <Bloco
        titulo="Contato de emergência"
        descricao="Quem o RH aciona se algo acontecer com o colaborador em campo."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto name="emergenciaNome" label="Nome" defaultValue={c.emergenciaNome} className="sm:col-span-2" />
          <CampoTexto name="emergenciaParentesco" label="Parentesco" defaultValue={c.emergenciaParentesco} />
          <CampoTexto name="emergenciaTelefone" label="Telefone" defaultValue={c.emergenciaTelefone} />
        </div>
      </Bloco>

      <Bloco
        titulo="Vínculo"
        descricao="A data de admissão é o que abre o controle de férias — sem ela, o colaborador não entra na programação. Em contrato de experiência, temporário ou estágio, preencha também o fim do prazo: deixar vencer transforma o contrato em indeterminado."
        acao={acao}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoData name="dataAdmissao" label="Admissão" defaultValue={c.dataAdmissao} />
          <CampoSelect name="tipoContrato" label="Tipo de contrato" opcoes={TIPOS_CONTRATO} defaultValue={c.tipoContrato} />
          <CampoData
            name="dataFimContrato"
            label="Fim do contrato (prazo determinado)"
            defaultValue={c.dataFimContrato}
          />
          <CampoTexto
            name="jornadaSemanal"
            label="Jornada semanal (horas)"
            type="number"
            min={1}
            max={60}
            defaultValue={c.jornadaSemanal?.toString() ?? ""}
          />
          <CampoTexto
            name="salarioBase"
            label="Salário base (R$)"
            defaultValue={c.salarioBase?.toString().replace(".", ",") ?? ""}
            placeholder="Ex: 2500,00"
          />
          <CampoData name="dataDesligamento" label="Desligamento" defaultValue={c.dataDesligamento} />
          <CampoSelect
            name="motivoDesligamento"
            label="Motivo do desligamento"
            opcoes={MOTIVOS_DESLIGAMENTO}
            defaultValue={c.motivoDesligamento}
          />
        </div>
      </Bloco>

      <PagamentoPix cpf={c.cpf} />
    </div>
  );
}

/**
 * Pagamento por PIX — chave é SEMPRE o CPF do colaborador.
 *
 * POR QUE NÃO SE DIGITA. Chave PIX de telefone, e-mail ou aleatória pode ser
 * cadastrada por qualquer pessoa e movida de conta a qualquer momento; a de
 * CPF, não — ela só existe numa conta cujo titular é aquele CPF. Aceitando só
 * ela, o salário não tem como cair na conta de outra pessoa, e não há campo
 * onde alguém erre ou troque um dígito.
 *
 * Não é campo de formulário nem coluna nova: a chave É o CPF que já está na
 * ficha. Guardar de novo criaria duas verdades sobre a mesma coisa, e o dia em
 * que divergissem o dinheiro iria para o número errado.
 *
 * O QUE PASSA A SER TRABALHO DO RH: avisar o colaborador para cadastrar esse
 * CPF como chave PIX na conta em que ele quer receber. O sistema não tem como
 * saber se a chave existe do lado do banco — quem confirma isso é a pessoa.
 */
function PagamentoPix({ cpf }: { cpf: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pagamento</CardTitle>
        <CardDescription>
          O salário é pago por PIX, e a chave é sempre o CPF do colaborador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cpf ? (
          <>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Chave PIX</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{formatarCpf(cpf)}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">O RH precisa avisar o colaborador</strong> para
              cadastrar esse CPF como chave PIX na conta em que ele quer receber o salário. O
              sistema não consegue verificar isso do lado do banco — quem confirma é a pessoa.
            </p>
            <p className="text-xs text-muted-foreground">
              Só chave de CPF é aceita. Telefone, e-mail e chave aleatória podem ser cadastrados
              por qualquer um e movidos de conta; a de CPF só existe em conta do próprio titular —
              é o que garante que o salário não caia na conta de outra pessoa.
            </p>
          </>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              <strong>Sem CPF na ficha não há como pagar.</strong> A chave PIX é o CPF — preencha o
              CPF no bloco &ldquo;Documentos&rdquo; acima para este colaborador entrar na folha.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
